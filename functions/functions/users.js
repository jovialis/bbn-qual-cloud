const functions = require('firebase-functions');
const admin = require('firebase-admin');

const errors = require('../lib/errors');
const users = require('../lib/user');
const session = require('../lib/session');

// Firestore
const firestore = admin.firestore();

const DEFAULT_USER_ACCESS = 0;

module.exports = function(e) {

	// Create a document whenever a user authenticates
	e.createUserDocUponAuthentication = functions.auth.user().onCreate(async user => {
		// Extract profile from user
		const email = user.email.toLowerCase();
		const name = user.displayName;

		// User doc reference
		const userRef = firestore.collection('users').doc(user.uid);

		// Attempt to discover a group for this user by email
		const { courseRef, teamRef } = await assignUserToGroupByPlaceholder(userRef, name, email);

		// User doc data
		const data = {
			email: email,
			name: name,
			nameLower: name.toLowerCase(),
			access: DEFAULT_USER_ACCESS,
			courseRef: courseRef,
			teamRef: teamRef
		};

		// Save!
		await userRef.set(data);
	});

};

// Replace all placeholder emails whenever a user first authenticates. Thus, they'll get added
// to any groups that they were previously only added to by email.
// Takes a user doc reference and an email string
// Returns a reference to the group, or null
async function assignUserToGroupByPlaceholder(userRef, name, email) {
	// Search all groups collections
	const queryRef = firestore
		.collectionGroup("teams")
		.where('emails', 'array-contains', email)
		.limit(1);

	// Execute query
	const queryResults = await queryRef.get();

	// Return null if empty
	if (queryResults.empty) {
		return { courseRef: null, teamRef: null };
	}

	// Get the group document we're assigning the user to
	const team = queryResults.docs[0];
	const teamRef = team.ref;
	const teamData = team.data();

	// Splice out placeholder email from group
	teamData.emails.splice(teamData.emails.indexOf(email), 1);

	// Add user reference to array of members
	teamData.memberRefs.push({
		ref: userRef,
		email: email,
		name: name
	});

	// Save team data
	await teamRef.update(teamData);

	// Return references
	return { courseRef: teamData.courseRef, teamRef: teamRef };
}
