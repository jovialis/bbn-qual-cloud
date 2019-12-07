const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize app
admin.initializeApp();

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
            // Instantiate reagent group list for this course
            const defaultReagentListDocument = await firestore.doc('/reagentGroups/default').get();
            if (!defaultReagentListDocument.exists) {
                reject('Encountered a problem accessing the default reagent list.');
                return;
            }

            // Create the actual reagent list document
            const newReagentListDoc = await firestore.collection('reagentGroups').add(defaultReagentListDocument.data());
            const reagentListID = newReagentListDoc.id;

            // Create course document
            firestore.collection('courses').add({
                name: courseName,
                teachers: [ userID ],
                archived: false,
                assignedReagentGroups: [],
                reagentGroup: reagentListID
            }).then(resolve).catch(reject);
        }
    });
});

// exports.checkAnswers = functions.https.onCall((data, context) => {
//     // Grab user UID
//     const authUID = context.auth.uid;
//
//     // Return a promise so Firebase will respond to the client with the resolve object
//     return new Promise(async (resolve, reject) => {
//         // Firestore object
//         const firestore = admin.firestore();
//
//         // Grab user by their UID
//         const user = await firestore.doc(`/users/${authUID}`).get();
//         if (!user.exists) {
//             reject('User document does not exist!');
//             return;
//         }
//
//         // Extract group information
//         const groupUID = user.data().group;
//         if (!groupUID) {
//             reject('User is not in a group.');
//             return;
//         }
//
//         // Grab Group by its UID
//         const group = await firestore.doc(`/groups/${groupUID}`).get();
//         if (!group.exists) {
//             reject('User group does not exist.');
//             return;
//         }
//
//         // Grab group progression by its UID
//         const progressionUID = group.data().progression;
//         const progression = await firestore.doc(`/groupProgressions/${progressionUID}`);
//
//
//     });
// });
//
// exports.nextReagentGroup = functions.https.onCall((data, context) => {
//     // Grab UID
//     const authUID = context.auth.uid;
//
//
// });