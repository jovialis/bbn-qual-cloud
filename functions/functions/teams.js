const functions = require('firebase-functions');
const admin = require('firebase-admin');

const errors = require('../lib/errors');
const user = require('../lib/user');
const session = require('../lib/session');
const teams = require('../lib/team');

// Firestore
const firestore = admin.firestore();

module.exports = function(e) {

	// Creates a progression document for a group whenever it's created
	e.createProgressionUponTeamCreation = functions.firestore.document('courses/{courseId}/teams/{teamId}')
		.onCreate(async (snapshot, context) => {
		// Grab data
		const snapshotData = snapshot.data();

		// References
		const courseRef = snapshotData.courseRef;
		const teamRef = snapshot.ref;

		// Define defaults for new document
		const data = {
			courseRef: courseRef,
			teamRef: teamRef,
			totalAttempts: 0,
			finished: false,
			memberRefs: (await teamRef.get()).data().memberRefs, // Include member refs in progression
			completed: {
				beginner: false,
				regular: [],
				challenge: []
			},
			current: null
		};

		// Add to progression folder under course
		const progressionRef = courseRef.collection('progressions').doc();
		await progressionRef.set(data);

		// Update group doc with reference
		await teamRef.update({
			progressionRef: progressionRef
		});
	});

	// Updates team members in a progression whenever a team is updated
	e.updateProgressionTeamMembersUponTeamUpdate = functions.firestore.document('courses/{courseId}/teams/{teamId}')
		.onUpdate(async (change, context) => {
			const newMemberRefs = change.after.data().memberRefs;

			// Check if the change is with the team
			if (change.before.data().memberRefs !== newMemberRefs) {
				// Fetch team progression
				const progressionRef = change.after.data().progressionRef;

				// Update progression with new member refs
				progressionRef.update({
					name: change.after.data().name,
					memberRefs: newMemberRefs
				});
			}
		});

	// Replace all emails in the team with user data
	e.assignUsersOnTeamCreate = functions.firestore.document('courses/{courseId}/teams/{teamId}')
		.onCreate(async (change, context) => {
			const courseRef = firestore.collection('courses').doc(context.params.courseId);
			const teamRef = change.ref;

			// Grab the emails
			const emails = change.data().emails;

			// Assign the users
			await teams.searchForUsersToAddByEmail(courseRef, teamRef, emails);
		});

};
