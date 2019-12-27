const functions = require('firebase-functions');
const admin = require('firebase-admin');
const firestore = admin.firestore();

module.exports.getUserById = getUserById;
async function getUserById(userId) {
	// Document
	const user = await firestore.doc(`/users/${userId}`).get();
	if (user.exists) {
		return Promise.resolve(user);
	} else {
		return Promise.reject('User does not exist.');
	}
}

module.exports.getGroupById = getGroupById;
async function getGroupById(groupId) {
	// Document
	const group = await firestore.doc(`/groups/${groupId}`).get();
	if (group.exists) {
		return Promise.resolve(group);
	} else {
		return Promise.reject('Group does not exist.');
	}
}

module.exports.getProgressionByUserId = getProgressionByUserId;
async function getProgressionByUserId(userId) {
	// Grab user
	const user = await getUserById(userId);

	const groupId = user.data().group;

	const progression = await getProgressionByGroupId(groupId);
	return Promise.resolve(progression);
}

module.exports.getProgressionByGroupId = getProgressionByGroupId;
async function getProgressionByGroupId(groupId) {
	const group = await getGroupById(groupId);

	const progressionId = group.data().progression;

	// Document
	const progression = await firestore.doc(`/groupProgressions/${progressionId}`).get();
	if (progression.exists) {
		return Promise.resolve(progression);
	} else {
		return Promise.reject('Progression does not exist.');
	}
}

module.exports.getCourseFromUserId = getCourseFromUserId;
async function getCourseFromUserId(userId) {
	// Document
	const user = await firestore.doc(`/users/${userId}`).get();
	if (!user.exists) {
		return Promise.reject('User does not exist.');
	}

	// Grab user group
	const groupId = user.data().group;
	const group = await getGroupById(groupId);

	// Grab course
	const course = await firestore.doc(`/courses/${ group.data().course }`).get();
	if (course.exists) {
		return Promise.resolve(course);
	} else {
		return Promise.reject('Course does not exist');
	}
}
