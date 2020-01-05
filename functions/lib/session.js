const functions = require('firebase-functions');
const admin = require('firebase-admin');

const errors = require('./errors');

// Firestore
const firestore = admin.firestore();

// Returns a boolean representing whether a user has a session available
// Accepts a user doc reference
// Returns a boolean
module.exports.isUserInSession = isUserInSession;
async function isUserInSession(userRef) {
	try {
		const sessionRef = await getUserSession(userRef);
		return sessionRef != null;
	} catch (e) {
		return Promise.resolve(false);
	}
}

// Gets a valid session for a user in a class
// Accepts a user document reference
// Returns a session document reference
module.exports.getUserSession = getUserSession;
async function getUserSession(userRef) {
	// Grab ref data
	const user = await userRef.get();
	const data = user.data();

	// Ensure that the user is a student
	if (data.access !== 0 || !data.courseRef || !data.teamRef) {
		errors.userNotStudent();
	}

	// Course document reference from user doc. Return active session
	let courseRef = data.courseRef;
	return await getCourseActiveSession(courseRef);
}

// Returns a session document reference
module.exports.getCourseActiveSession = getCourseActiveSession;
async function getCourseActiveSession(courseRef) {
	// Sessions query
	let queryRef = courseRef
		.collection('sessions')
		.where('expired', '==', false);

	// Query results
	let query = await queryRef.get();

	// Store the latest expiration date. We only want to keep the session with the latest date and expire all the others.
	// This is a little redundancy to prevent duplicate sessions
	const now = new Date();
	let latestExpirationDate = new Date();

	// Search for a session that hasn't timed out. Firebase doesn't let us search in that way so we have to do it manually.
	// Firebase also doesn't let us set a timer to expire this, so we have to compare timestamps manually.
	const validDocs = query.docs.filter(async function(doc) {
		// Data
		const data = doc.data();
		const expiration = new Date(data.expiration.toMillis());

		// Doc has expired or will expire before others. We update it then return false to exclude it.
		if (expiration < now || expiration < latestExpirationDate) {
			await doc.ref.update({ expired: true });
			return false;
		} else {
			latestExpirationDate = expiration;
			return true;
		}
	});

	// No session available
	if (validDocs.length === 0) {
		return Promise.resolve(null);
	}

	// Return first session from query
	return Promise.resolve(validDocs[0].ref);
}

module.exports.startSession = startSession;
async function startSession(userRef, courseRef, duration) {
	// Ensure there's no valid session already
	if (await getCourseActiveSession(courseRef)) {
		errors.courseAlreadyInSession();
	}

	// Expire at Now + Duration time
	let now = new Date();
	let expiration = new Date(now.getTime() + duration * 60000);
	let expirationTimestamp = admin.firestore.Timestamp.fromDate(expiration);

	// Data
	const data = {
		expired: false,
		timestamp: admin.firestore.Timestamp.now(),
		expiration: expirationTimestamp,
		teacherRef: userRef,
		courseRef: courseRef
	};

	// Generate reference then set data
	const sessionRef = courseRef.collection('sessions').doc();
	await sessionRef.set(data);

	return sessionRef;
}
