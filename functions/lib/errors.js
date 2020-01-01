const functions = require('firebase-functions');

// Throw a HTTPS error for there not being an authenticated error
module.exports.userNotAuthenticated = () => {
	throw new functions.https.HttpsError("permission-denied", "User must be authenticated.");
};

// Not teacher
module.exports.userNotTeacher = () => {
	throw new functions.https.HttpsError("permission-denied", "User must be a teacher.");
};

// Not student
module.exports.userNotStudent = () => {
	throw functions.https.HttpsError("invalid-argument", "User is not a student or is not in a class.");
};

// Throw a HTTPS error for no valid session
module.exports.userNotInSession = () => {
	throw new functions.https.HttpsError("unavailable", "User's course not in session.");
};

// Throw a HTTPS error for attempting to check answers without any groups assigned.
module.exports.noAssignedSets = () => {
	throw new functions.https.HttpsError("failed-precondition", "No reagent group assigned! Call getReagentGroup before checking answers.");
};

// Throw a HTTPS error for attempting to access an invalid course
module.exports.invalidCourse = () => {
	throw new functions.https.HttpsError("invalid-argument", "Attempted to access an invalid course.");
};

// Already in session
module.exports.courseAlreadyInSession = () => {
	throw new functions.https.HttpsError("failed-precondition", "That course already has an active session.");
};
