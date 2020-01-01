const admin = require('firebase-admin');

// Firestore
const firestore = admin.firestore();

// Util method to return a reference to a user doc by UID
module.exports.getUserRef = getUserRef;
function getUserRef(uid) {
	return firestore.collection('users').doc(uid);
}

// Util method to return true if it's a teacher
module.exports.isTeacher = isTeacher;
async function isTeacher(userRef) {
	// Teacher data
	const userData = (await userRef.get()).data();
	return userData.access > 0;
}

// Search for courses where the user is a teacher
