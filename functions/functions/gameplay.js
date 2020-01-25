const functions = require('firebase-functions');
const admin = require('firebase-admin');

const errors = require('../lib/errors');
const user = require('../lib/user');
const sessions = require('../lib/session');
const courses = require('../lib/course');

// Firestore
const firestore = admin.firestore();

module.exports = function(e) {

	// Checks whether the user's answers are correct.
	e.checkAnswers = functions.https.onCall(async (data, context) => {
		// Ensure there's a user
		if (!context.auth.uid) {
			errors.userNotAuthenticated();
		}

		// User reference
		const userRef = user.getUserRef(context.auth.uid);
		const userData = (await userRef.get()).data();

		// Ensure we're in a session
		if (!(await sessions.isUserInSession(userRef))) {
			errors.userNotInSession();
		}

		// Course reference
		const courseRef = userData.courseRef;
		const courseData = (await courseRef.get()).data();

		// Load user group
		const teamRef = userData.teamRef;
		const teamData = (await teamRef.get()).data();

		// Load progression
		const progressionRef = teamData.progressionRef;
		const progressionData = (await progressionRef.get()).data();

		// Reject if no current set assigned
		if (!progressionData.current) {
			errors.noAssignedSets();
		}

		const current = progressionData.current;

		// Return the iceberg ID if frozen
		if (current.frozen) {
			return {
				result: 'frozen',
				icebergRef: current.icebergRef.path
			};
		}

		// Adjust attempt tallies and remainder
		const totalAttempts = progressionData.totalAttempts + 1;
		const totalCurGroupAttempts = current.groupAttempts + 1;
		const attemptsRemaining = current.attemptsRemaining - 1;

		// Correct answer
		const correctAnswer = current.answers;
		const userAnswer = data.answers;

		// Compare answers by converting the lists to a string then comparing
		if (JSON.stringify(userAnswer) === JSON.stringify(correctAnswer)) {
			// SUCCESS
			const groupNum = current.group;

			// Number of sets required
			const settings = await courses.getCourseSettings(courseRef);
			const numNormalRequired = settings.numRegularGroups;
			const numChallengeRequired = settings.numChallengeGroups;

			// Update progression data
			progressionData.current = null;
			progressionData.totalAttempts = totalAttempts;

			// Mark set as completed by user
			const difficulty = current.difficulty;
			if (difficulty === 0) {
				// Beginner completed
				progressionData.completed.beginner = true;
			} else if (difficulty === 1) {
				// Normal completed
				progressionData.completed.regular.push(groupNum);
			} else if (difficulty === 2) {
				// Challenge completed
				progressionData.completed.challenge.push(groupNum);
			}

			// Update progression
			await progressionRef.update(progressionData);

			// Remove user reagent group from course assigned groups
			let assignedReagentGroups = courseData.assignedReagentGroups;
			assignedReagentGroups.splice(assignedReagentGroups.indexOf(current.prefix), 1);
			await courseRef.update({ assignedReagentGroups: assignedReagentGroups });

			// Num completed by user
			let numNormalCompleted = progressionData.completed.regular.length;
			let numChallengeCompleted = progressionData.completed.challenge.length;

			// Check if user group is done
			if (numNormalCompleted >= numNormalRequired && numChallengeCompleted >= numChallengeRequired) {
				await progressionRef.update({
					finished: true
				});

				// Mark as finished to user
				return {
					result: 'finished',
					totalAttempts: progressionData.totalAttempts
				};
			} else {
				return {
					result: 'correct',
					groupAttempts: totalCurGroupAttempts
				};
			}
		} else {
			// Incorrect
			// If no more attempts remaining, freeze group
			if (attemptsRemaining <= 0) {
				// Create iceberg
				const icebergRef = await generateIceberg(teamRef, progressionRef, courseRef, current.group, teamData.memberRefs);

				await progressionRef.update({
					current: {
						...progressionData.current,
						attemptsRemaining: 0,
						frozen: true,
						icebergRef: icebergRef,
						groupAttempts: totalCurGroupAttempts
					},
					totalAttempts: totalAttempts
				});

				return {
					result: 'frozen',
					icebergRef: icebergRef.path
				};
			} else {
				await progressionRef.update({
					current: {
						...progressionData.current,
						attemptsRemaining: attemptsRemaining,
						groupAttempts: totalCurGroupAttempts
					},
					totalAttempts: totalAttempts
				});

				return {
					attemptsRemaining: attemptsRemaining,
					result: 'incorrect'
				};
			}
		}
	});

	// Obtain the next reagent group for the group
	e.getReagentGroup = functions.https.onCall(async (data, context) => {
		// Ensure there's a user
		if (!context.auth.uid) {
			errors.userNotAuthenticated();
		}

		// User reference
		const userRef = user.getUserRef(context.auth.uid);
		const userData = (await userRef.get()).data();

		// Ensure we're in a session
		if (!(await sessions.isUserInSession(userRef))) {
			errors.userNotInSession();
		}

		// Grab course
		const courseRef = userData.courseRef;
		const courseData = (await courseRef.get()).data();

		// Load user group
		const teamRef = userData.teamRef;
		const teamData = (await teamRef.get()).data();

		// Grab progression
		const progressionRef = teamData.progressionRef;
		const progressionData = (await progressionRef.get()).data();

		// Grab course settings
		const settings = await courses.getCourseSettings(courseRef);
		const assignBeginnerGroup = settings.assignBeginnerGroup;
		const numNormalRequired = settings.numRegularGroups;
		const numChallengeRequired = settings.numChallengeGroups;
		const numAttempts = settings.attemptsBeforeFreeze;

		// Num completed by user
		const beginnerCompleted = progressionData.completed.beginner;
		const numNormalCompleted = progressionData.completed.regular.length;
		const numChallengeCompleted = progressionData.completed.challenge.length;

		const progress = buildProgressStructure(
			beginnerCompleted, assignBeginnerGroup,
			numNormalCompleted, numNormalRequired,
			numChallengeCompleted, numChallengeRequired
		);

		// Return status of finished if flagged, or if all required grousp are done
		if (progressionData.finished || (numNormalCompleted >= numNormalRequired && numChallengeCompleted >= numChallengeRequired)) {
			// Update finished var if it hasn't been already
			if (!progressionData.finished) {
				await progressionRef.update({ finished: true });
			}

			// Return finished status
			return generateGetReagentGroupResponse('finished', progress, {
				totalAttempts: progressionData.totalAttempts
			});
		}

		// A reagent group has already been assigned
		if (progressionData.current) {
			const current = progressionData.current;

			if (current.frozen) {
				// If we're frozen, relay that info to the user
				return generateGetReagentGroupResponse('frozen', progress, {
					icebergRef: current.icebergRef.path
				});
			} else {
				// Otherwise, throw an active status
				return generateGetReagentGroupResponse('active', progress, {
					prefix: current.prefix,
					reagents: current.reagents,
					difficulty: current.difficulty,
					attemptsRemaining: current.attemptsRemaining
				});
			}
		}

		// Variables we've selected during the generation process
		let selectedGroup;
		let selectedGroupNumber;
		let selectedVariationNumber;
		let selectedPrefix;
		let selectedDifficulty;

		// Grab the reagent group document for the class
		const reagentGroupsData = (await courseData.reagentGroupRef.get()).data();

		// Assign beginner group to the user
		if (!beginnerCompleted && (numNormalCompleted === 0 && numChallengeCompleted === 0 && assignBeginnerGroup)) {
			// Assign beginner group
			selectedGroup = reagentGroupsData.beginnerGroup;
			selectedGroupNumber = 0;
			selectedVariationNumber = Math.floor(Math.random() * selectedGroup.length);
			selectedPrefix = `${ selectedVariationNumber }00`;
			selectedDifficulty = 0;
		} else {
			// Relevant course reagent pool
			let reagentGroupsPool;
			// Already used up reagents
			let completedReagentGroupsPool;

			// Find the next group for the user
			if (numNormalCompleted < numNormalRequired) {
				// Assign regular
				reagentGroupsPool = reagentGroupsData.regularGroups;
				completedReagentGroupsPool = progressionData.completed.regular;
				selectedDifficulty = 1;
			} else {
				// Assign challenge
				reagentGroupsPool = reagentGroupsData.challengeGroups;
				completedReagentGroupsPool = progressionData.completed.challenge;
				selectedDifficulty = 2;
			}

			// Don't assign groups that other people are currently using
			const currentlyAssignedReagentGroups = courseData.assignedReagentGroups;

			// Pick a reagent group number and a variation number. Repeat if it's in use
			do {
				// Grab a group number, excluding already used groups
				const reagentGroupKey = findValidReagentGroupForUser(reagentGroupsPool, completedReagentGroupsPool);

				// Find a random variation number from 1-N, where N is the number of items in the group
				const variationNumber = Math.floor(Math.random() * reagentGroupsPool[reagentGroupKey].length);

				// Compile course number with variation # first, then the two digit version of the variation number
				const compiledNumber = `${(variationNumber + 1)}` + ("0" + reagentGroupKey).slice(-2);

				// Check to make sure the compiled number isn't in use by any other group
				if (!currentlyAssignedReagentGroups.includes(compiledNumber)) {
					// Store selected items
					selectedGroup = reagentGroupsPool[reagentGroupKey];
					selectedGroupNumber = Number(reagentGroupKey);
					selectedVariationNumber = variationNumber;
					selectedPrefix = compiledNumber;
				}
			} while (!selectedGroup);
		}

		let correctAnswerList = selectedGroup;

		// Remove last item, place it at the index dictated by variation. This constitutes our correct answers in this specific order
		const lastItem = correctAnswerList[correctAnswerList.length - 1];
		correctAnswerList.splice(correctAnswerList.length - 1, 1); // Remove last item
		correctAnswerList.splice(selectedVariationNumber, 0, lastItem); // Reinsert item at the given index

		// Shuffle the list of reagents to make it harder ;)
		// Clone the array then random sort
		let shuffledReagents = [...selectedGroup];
		shuffledReagents.sort(() => Math.random() - 0.5);

		const currentData = {
			current: {
				reagents: shuffledReagents,
				answers: correctAnswerList,
				prefix: selectedPrefix,
				attemptsRemaining: numAttempts,
				groupAttempts: 0,
				group: `${ selectedGroupNumber }`,
				difficulty: selectedDifficulty,
				frozen: false
			}
		};

		// Update progression
		await progressionRef.update(currentData);

		// Insert this prefix into the globally used prefixes if not a beginner group
		if (selectedGroupNumber !== 0) {
			let assignedReagentGroups = courseData.assignedReagentGroups;
			assignedReagentGroups.push(selectedPrefix);

			await courseRef.update({ assignedReagentGroups: assignedReagentGroups });
		}

		// Return selected groups to the user
		return generateGetReagentGroupResponse('active', progress, {
			prefix: selectedPrefix,
			reagents: shuffledReagents,
			difficulty: selectedDifficulty,
			attemptsRemaining: numAttempts,
		});
	});

	// Clears the reagent
	e.clearFrozenOnIcebergResolve = functions.firestore.document('/courses/{courseId}/icebergs/{icebergId}').onUpdate(async (change, context) => {
		let data = change.after.data();

		// If resolved has been flagged true
		if (data.resolved) {
			// We go into the progression doc and update available # attempts and the frozen flag
			let progressionRef = data.progressionRef;
			let courseRef = data.courseRef;

			// Grab number of attempts to give from course settings
			const numAttemptsToGrant = (await courses.getCourseSettings(courseRef)).attemptsAfterFreeze;

			// Update data with unfrozen and grant the # of attempts
			let progressionCurData = (await progressionRef.get()).data().current;

			progressionCurData.frozen = false;
			progressionCurData.attemptsRemaining = numAttemptsToGrant;

			delete progressionCurData.icebergRef; // Remove iceberg flag

			// Perform update
			await progressionRef.update({
				current: progressionCurData
			});
		}
	});

};

// Find a group for the user based on available groups, excluding groups the user has already visited
function findValidReagentGroupForUser(reagentGroups, completedGroups) {
	// Grab group numbers and remove all that the user has already visited.
	let keys = Object.keys(reagentGroups);
	completedGroups.forEach(invalidKey => { keys.splice(keys.indexOf(invalidKey), 1); });

	// Return a random valid key
	return keys[Math.floor(Math.random() * keys.length)];
}

async function generateIceberg(groupId, progressionId, courseId, reagentGroup, teamMembers) {
	let data = {
		team: {
			ref: groupId,
			members: teamMembers
		},
		progressionRef: progressionId,
		courseRef: courseId,
		timestamp: admin.firestore.Timestamp.now(),
		reagentGroup: reagentGroup,
		resolved: false
	};

	let collection = courseId.collection('icebergs');
	return await collection.add(data);
}

function generateGetReagentGroupResponse(status, progress, content) {
	return {
		status: status,
		progress: progress,
		...content
	};
}

function buildProgressStructure(beginnerCompleted, beginnerRequired, normalCompleted, normalRequired, challengeCompleted, challengeRequired) {
	return {
		beginner: {
			completed: beginnerCompleted ? 1 : 0,
			required: beginnerRequired ? 1 : 0
		},
		regular: {
			completed: normalCompleted,
			required: normalRequired
		},
		challenge: {
			completed: challengeCompleted,
			required: challengeRequired
		}
	};
}
