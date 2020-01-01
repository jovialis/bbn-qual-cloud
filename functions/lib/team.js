const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Firestore
const firestore = admin.firestore();

const DEFAULT_GROUP_DETAILS = {
	emails: [],
	memberRefs: []
};

module.exports.createGroup = createGroup;
async function createGroup(courseRef) {
	// Data
	const groupData = {
		courseRef: courseRef,
		...DEFAULT_GROUP_DETAILS
	};

	// Reference document then set data
	const teamRef = courseRef.collection('teams').doc();
	await teamRef.set(groupData);

	return teamRef;
}
