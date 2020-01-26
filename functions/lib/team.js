const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Firestore
const firestore = admin.firestore();

const DEFAULT_GROUP_DETAILS = {
	memberRefs: []
};

module.exports.createGroup = createGroup;
async function createGroup(courseRef, emails, name) {
	// Data
	const groupData = {
		courseRef: courseRef,
		emails: emails,
		name: name,
		...DEFAULT_GROUP_DETAILS
	};

	// Reference document then set data
	const teamRef = courseRef.collection('teams').doc();
	await teamRef.set(groupData);

	return teamRef;
}

module.exports.searchForUsersToAddByEmail = searchForUsersToAddByEmail;
async function searchForUsersToAddByEmail(courseRef, teamRef, emails) {
	let newMemberRefs = [];

	// Query user documents for a user with that email
	for (const email of emails) {
		// Search all groups collections
		const queryRef = firestore
			.collection('users')
			.where('email', '==', email)
			.limit(1);

		// If there's a document
		const results = await queryRef.get();

		// If there is a document
		if (!results.empty) {
			const user = results.docs[0];
			const userData = user.data();

			// Add the data
			newMemberRefs.push({
				email: userData.email,
				name: userData.name,
				ref: user.ref
			});

			// Remove email
			emails.splice(emails.indexOf(email), 1);

			// Update user doc with details
			await user.ref.update({
				courseRef: courseRef,
				teamRef: teamRef
			});
		}
	}

	// Update the team
	await teamRef.update({
		emails: emails,
		memberRefs: newMemberRefs
	});
}
