const functions = require('firebase-functions');
const admin = require('firebase-admin');

const errors = require('../lib/errors');
const user = require('../lib/user');
const session = require('../lib/session');

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

};
