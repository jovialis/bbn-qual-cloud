const functions = require('firebase-functions');
const admin = require('firebase-admin');

const search = require('../search');

// Firestore
const firestore = admin.firestore();

module.exports = function(e) {

	// Checks whether the user's answers are correct.
	e.checkAnswers = functions.https.onCall((data, context) => {
		// Grab user UID
		const authUID = context.auth.uid;
		if (!authUID) {
			return Promise.reject("User not authenticated");
		}

		// Return a promise so Firebase will respond to the client with the resolve object
		return new Promise(async (resolve, reject) => {
			try {

				// Grab progression
				const progression = await search.getProgressionByUserId(authUID);
				const progressionRef = firestore.doc(`/groupProgressions/${ progression.id }`);
				const progressionData = progression.data();

				// Reject if no current
				if (!progressionData.current) {
					reject("No reagent group assigned! Call getReagentGroup before checking answers.");
					return;
				}


				// TODO: Make sure you can't check answers or get reagent groups unless the class is live

				// todo: CHECK IF GROUP IS FROZEN

				// TODO: Write method to automatically freeze an account if the attempts increase too much

				// Correct answer
				const userAnswer = data.answers;
				const correctAnswer = progressionData.current.answers;

				if (JSON.stringify(userAnswer) === JSON.stringify(correctAnswer)) {
					// SUCCESS
					const groupNum = progressionData.current.group;
					const prefix = progressionData.current.prefix;
					const difficulty = progressionData.current.difficulty;

					// Get course
					const course = await search.getCourseFromUserId(authUID);
					const courseRef = firestore.doc(`/courses/${ course.id }`);
					const courseData = course.data();

					// Grab course settings
					const numNormalRequired = courseData.settings.numRegularGroups;
					const numChallengeRequired = courseData.settings.numChallengeGroups;

					// Num completed by user
					const numNormalCompleted = progressionData.completed.regular.length;
					const numChallengeCompleted = progressionData.completed.challenge.length;

					// Erase current
					progressionData.current = null;

					// Mark set as completed by user
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

					// Remove user reagent group from assigned
					let assignedReagentGroups = courseData.assignedReagentGroups;
					assignedReagentGroups.splice(assignedReagentGroups.indexOf(prefix), 1);
					await courseRef.update({ assignedReagentGroups: assignedReagentGroups });

					// Check if user group is done
					if (numNormalCompleted >= numNormalRequired && numChallengeCompleted >= numChallengeRequired) {
						await progressionRef.update({
							finished: true
						});

						// Mark as finished to user
						resolve({
							result: 'finished'
						});

						return;
					}

					// Mark set as completed to user.
					resolve({
						result: 'correct'
					});

				} else {
					// Incorrect
					// Increment attempts
					await progressionRef.update({
						current: {
							...progressionData.current,
							attempts: progressionData.attempts + 1
						}
					});

					resolve({
						result: 'incorrect'
					});
				}

			} catch (e) {
				reject(e);
			}
		});
	});

	// Obtain the next reagent group for the group
	e.getReagentGroup = functions.https.onCall((data, context) => {
		// Grab UID
		const authUID = context.auth.uid;
		if (!authUID) {
			return Promise.reject("User not authenticated");
		}

		// Promise
		return new Promise(async (resolve, reject) => {
			try {
				// Get course
				const course = await search.getCourseFromUserId(authUID);
				const courseData = course.data();

				// Get progression
				const progression = await search.getProgressionByUserId(authUID);
				const progressionData = progression.data();

				// Grab course settings
				const assignBeginnerGroup = courseData.settings.beginnerGroup;
				const numNormalRequired = courseData.settings.numRegularGroups;
				const numChallengeRequired = courseData.settings.numChallengeGroups;

				// Num completed by user
				const beginnerCompleted = progressionData.completed.beginner;
				const numNormalCompleted = progressionData.completed.regular.length;
				const numChallengeCompleted = progressionData.completed.challenge.length;

				// Return status of finished if flagged, or if all required grousp are done
				if (progressionData.finished || (numNormalCompleted >= numNormalRequired && numChallengeCompleted >= numChallengeRequired)) {
					// Update finished var if it hasn't been already
					if (!progressionData.finished) {
						const progressionRef = firestore.doc(`/groupProgressions/${progression.id}`);
						await progressionRef.update({finished: true});
					}

					resolve({
						status: "finished",
						progress: {
							beginner: {
								completed: beginnerCompleted ? 1 : 0,
								required: assignBeginnerGroup ? 1 : 0
							},
							regular: {
								completed: numNormalCompleted,
								required: numNormalRequired
							},
							challenge: {
								completed: numChallengeCompleted,
								required: numChallengeRequired
							}
						}
					});
					return;
				}

				// A reagent group has already been assigned
				if (progressionData.current) {
					resolve({
						status: "active",
						prefix: progressionData.current.prefix,
						reagents: progressionData.current.reagents,
						difficulty: progressionData.current.difficulty,
						progress: {
							beginner: {
								completed: beginnerCompleted ? 1 : 0,
								required: assignBeginnerGroup ? 1 : 0
							},
							regular: {
								completed: numNormalCompleted,
								required: numNormalRequired
							},
							challenge: {
								completed: numChallengeCompleted,
								required: numChallengeRequired
							}
						}
					});
					return;
				}

				let selectedGroup;
				let selectedGroupNumber;
				let selectedVariationNumber;
				let selectedPrefix;
				let selectedDifficulty;

				// Grab the reagent group document for the class
				const reagentGroupsData = (await firestore.doc(`/reagentGroups/${courseData.reagentGroup}`).get()).data();

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
						const reagentGroupKey = findValidGroupForUser(reagentGroupsPool, completedReagentGroupsPool);

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

				// TODO: Fix assigning beginner group

				let correctAnswerList = selectedGroup;

				// Remove last item, place it at the index dictated by variation. This constitutes our correct answers in this specific order
				const lastItem = correctAnswerList[correctAnswerList.length - 1];
				correctAnswerList.splice(correctAnswerList.length - 1, 1); // Remove last item
				correctAnswerList.splice(selectedVariationNumber, 0, lastItem); // Reinsert item at the given index

				// Shuffle the list of reagents to make it harder ;)
				// Clone the array then random sort
				let shuffledReagents = [...selectedGroup];
				shuffledReagents.sort(() => Math.random() - 0.5);

				const updateData = {
					current: {
						reagents: shuffledReagents,
						answers: correctAnswerList,
						prefix: selectedPrefix,
						attempts: 0,
						group: `${ selectedGroupNumber }`,
						difficulty: selectedDifficulty
					},
					frozen: false
				};

				// Update progression
				const progressionRef = firestore.doc(`/groupProgressions/${progression.id}`);
				await progressionRef.update(updateData);

				// Insert this prefix into the globally used prefixes if not a beginner group
				if (selectedGroupNumber !== 0) {
					let assignedReagentGroups = courseData.assignedReagentGroups;
					assignedReagentGroups.push(selectedPrefix);

					const courseRef = firestore.doc(`/courses/${course.id}`);
					await courseRef.update({ assignedReagentGroups: assignedReagentGroups });
				}

				// TODO: Add configurable # of attempts

				// Return content to the user
				resolve({
					status: "active",
					prefix: selectedPrefix,
					reagents: shuffledReagents,
					difficulty: selectedDifficulty,
					progress: {
						beginner: {
							completed: beginnerCompleted ? 1 : 0,
							required: assignBeginnerGroup ? 1 : 0
						},
						regular: {
							completed: numNormalCompleted,
							required: numNormalRequired
						},
						challenge: {
							completed: numChallengeCompleted,
							required: numChallengeRequired
						}
					}
				});
			} catch (e) {
				reject(e);
			}
		});
	});

};

// Find a group for the user based on available groups, excluding groups the user has already visited
function findValidGroupForUser(reagentGroups, completedGroups) {
	// Grab group numbers and remove all that the user has already visited.
	let keys = Object.keys(reagentGroups);
	completedGroups.forEach(invalidKey => { keys.splice(keys.indexOf(invalidKey), 1); });

	// Return a random valid key
	return keys[Math.floor(Math.random() * keys.length)];
}
