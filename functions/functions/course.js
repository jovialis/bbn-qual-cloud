const functions = require('firebase-functions');
const admin = require('firebase-admin');

const errors = require('../lib/errors');
const user = require('../lib/user');
const session = require('../lib/session');

// Firestore
const firestore = admin.firestore();

module.exports = function(e) {

	// Create a reagent list for the course upon creation
	e.createReagentGroupUponCourseCreation = functions.firestore.document('courses/{courseId}')
		.onCreate(async (snapshot, context) => {
		const firestore = admin.firestore();

		// Instantiate reagent group list for this course
		const defaultReagentListDocument = await firestore.collection("reagentGroups").doc('default').get();
		if (!defaultReagentListDocument.exists) {
			return Promise.reject('Encountered a problem accessing the default reagent list.');
		}

		// Create the actual reagent list document
		const newReagentListRef = firestore.collection('reagentGroups').doc();
		await newReagentListRef.set(defaultReagentListDocument.data());

		// Define defaults for new document
		const data = {
			reagentGroupRef: newReagentListRef
		};

		// Update course data with the reagent group reference
		await snapshot.ref.update(data);
	});

	// Create a group upon request from a teacher
	e.createCourseUponTeacherRequest = functions.https.onCall((data, context) => {
		const REQUIRED_PERMISSIONS = 2;


	});



};

