const functions = require('firebase-functions');
const admin = require('firebase-admin');

const search = require('../search');

// Firestore
const firestore = admin.firestore();

module.exports = function(e) {

	// Clears the reagent
	e.clearFrozenOnIcebergResolve = functions.firestore.document('/icebergs/{iceberg}').onUpdate(async (change, context) => {
		let data = change.after.data();

		// If resolved has been flagged true
		if (data.resolved) {

			// We go into the progression doc and update available # attempts and the frozen flag
			let progressionId = data.progression;
			let courseId = data.course;

			// Grab number of attempts to give from course settings
			const courseRef = firestore.collection('courses').doc(courseId);
			const numAttemptsToGrant = (await courseRef.get()).data().settings.unfrozenAttempts;

			// Update data with unfrozen and grant the # of attempts
			const progressionRef = firestore.collection('groupProgressions').doc(progressionId);
			let progressionCurData = (await progressionRef.get()).data().current;

			progressionCurData.frozen = false;
			progressionCurData.attempts = numAttemptsToGrant;

			delete progressionCurData.iceberg; // Remove iceberg flag

			// Perform update
			await progressionRef.update({
				current: progressionCurData
			});
		}
	});

};
