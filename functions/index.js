const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize app
admin.initializeApp();

const gameplay = require('./functions/gameplay');
gameplay(exports);

const gameplayTriggers = require('./functions/gameplayTriggers');
gameplayTriggers(exports);

// Create a document whenever a user authenticates
exports.createUserDocumentUponAuthentication = functions.auth.user().onCreate(user => {
    // Profile
    const uid = user.uid;
    const email = user.email;
    const name = user.displayName;

    // Program
    const defaultAccess = 0;
    return new Promise(async (resolve, reject) => {
        // Firestore object
        const firestore = admin.firestore();

        const data = {
            email: email,
            name: name,
            access: defaultAccess
        };

        // Create document and store data
        const document = firestore.doc(`/users/${ uid }`);
        if ((await document.get()).exists) {
            document.update(data).then(resolve).catch(reject);
        } else {
            document.set(data).then(resolve).catch(reject);
        }
    });
});

// Replace all placeholder emails whenever a user first authenticates. Thus, they'll get added
// to any groups that they were previously only added to by email.
exports.replacePlaceholderEmailsUponAuthentication = functions.auth.user().onCreate(user => {
    // Profile
    const uid = user.uid;
    const email = user.email.toLowerCase();

    // Discover all groups where this user's email is placeheld and replace them
    return new Promise(async (resolve, reject) => {
        // Firestore object
        const firestore = admin.firestore();

        const userDocument = firestore.doc(`/users/${ uid }`);

        // Search for first document referencing user
        const documents = firestore.collection("groups").where('placeholders', 'array-contains', email).limit(1);
        const snapshot = await documents.get();

        // No placeholder to replace so we just set defaults and leave.
        if (snapshot.empty) {
            const nullData = {
                group: '',
                course: ''
            };

            // Update if document doesn't exist, set otherwise
            if ((await userDocument.get()).exists) {
                userDocument.update(nullData).then(resolve).catch(reject);
            } else {
                userDocument.set(nullData).then(resolve).catch(reject);
            }
        } else {
            // Remove email from array
            const groupDocument = snapshot.docs[0];

            const group = await groupDocument.data();
            group.placeholders.splice(group.placeholders.indexOf(email), 1);

            // Add user ID to array
            group.members.push(uid);

            // UPdate group contents
            await firestore.doc(`/groups/${ groupDocument.id }`).set(group);

            const membershipData = {
                group: groupDocument.id,
                course: group.course
            };

            // Update if document doesn't exist, set otherwise
            if ((await userDocument.get()).exists) {
                userDocument.update(membershipData).then(resolve).catch(reject);
            } else {
                userDocument.set(membershipData).then(resolve).catch(reject);
            }
        }
    });
});

// Create a group upon request from a teacher
exports.createCourseUponTeacherRequest = functions.https.onCall((data, context) => {
    const REQUIRED_PERMISSIONS = 2;

    const defaultCourseData = {
        archived: false,
        assignedReagentGroups: [],
        settings: {
            beginnerGroup: true,
            numRegularGroups: 4,
            numChallengeGroups: 3
        }
    };

    // Grab user UID
    const userID = context.auth.uid;

    // Grab info
    const courseName = data.name;
    if (!courseName) {
        return Promise.reject("Invalid course name.");
    }

    return new Promise(async (resolve, reject) => {
        // Firestore object
        const firestore = admin.firestore();

        // Assume that there's a user doc
        const user = await firestore.doc(`/users/${userID}`).get();
        if (!user.exists || user.data().access < REQUIRED_PERMISSIONS) {
            reject('Insufficient permissions');
        } else {
            // Create course document
            firestore.collection('courses').add({
                name: courseName,
                teachers: [ userID ],
                ...defaultCourseData
            }).then(resolve).catch(reject);
        }
    });
});

// Create a reagent list for the course upon creation
exports.createReagentGroupUponCourseCreation = functions.firestore.document('courses/{courseId}').onCreate(async (snapshot, context) => {
    const firestore = admin.firestore();

    // Grab data
    const courseId = context.params.courseId;
    const snapshotData = snapshot.data();

    // Instantiate reagent group list for this course
    const defaultReagentListDocument = await firestore.doc('/reagentGroups/default').get();
    if (!defaultReagentListDocument.exists) {
        return Promise.reject('Encountered a problem accessing the default reagent list.');
    }

    // Create the actual reagent list document
    const newReagentListDoc = await firestore.collection('reagentGroups').add(defaultReagentListDocument.data());
    const reagentListID = newReagentListDoc.id;

    // Define defaults for new document
    const data = {
        reagentGroup: reagentListID
    };

    firestore.doc(`/courses/${ courseId }`).update(data);
});

// Creates a progression document for a group whenever it's created
exports.createProgressionDocumentUponGroupCreation = functions.firestore.document('groups/{groupId}').onCreate(async (snapshot, context) => {
    // Grab data
    const groupId = context.params.groupId;
    const snapshotData = snapshot.data();

    // Define defaults for new document
    const data = {
        course: snapshotData.course,
        completed: {
            beginner: false,
            regular: [],
            challenge: []
        },
        current: null,
        finished: false,
        group: groupId,
        totalAttempts: 0
    };

    // Set defaults
    const firestore = admin.firestore();

    const progressionId = (await firestore.collection('groupProgressions').add(data)).id;

    // Add progression to group
    firestore.doc(`groups/${ groupId }`).update({
        progression: progressionId
    });
});
