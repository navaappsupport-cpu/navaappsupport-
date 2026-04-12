// Diagnostic script to check Firestore data for chat issues
const admin = require('firebase-admin');

admin.initializeApp({ projectId: 'chatconnect-2c26f' });
const db = admin.firestore();

async function diagnose() {
    console.log('=== USERS ===');
    const users = await db.collection('users').get();
    const userMap = {};
    users.forEach(doc => {
        userMap[doc.id] = doc.data();
        console.log(`  ${doc.id} => ${doc.data().fullName} (${doc.data().email})`);
    });

    console.log('\n=== FRIENDS ===');
    const friends = await db.collection('friends').get();
    if (friends.empty) {
        console.log('  NO FRIEND DOCUMENTS FOUND!');
    }
    friends.forEach(doc => {
        const d = doc.data();
        const expectedId = `${d.userId}_${d.friendId}`;
        const isDeterministic = doc.id === expectedId;
        console.log(`  ${doc.id} => userId:${d.userId}, friendId:${d.friendId}, friendName:${d.friendName || 'N/A'} ${isDeterministic ? '[DETERMINISTIC]' : '[LEGACY RANDOM ID]'}`);
    });

    console.log('\n=== FRIEND REQUESTS ===');
    const requests = await db.collection('friendRequests').get();
    if (requests.empty) {
        console.log('  No pending requests');
    }
    requests.forEach(doc => {
        const d = doc.data();
        console.log(`  ${doc.id} => from:${d.from}(${d.fromName}), to:${d.to}(${d.toName}), status:${d.status}`);
    });

    console.log('\n=== MESSAGES ===');
    const msgCollections = await db.collection('messages').listDocuments();
    if (msgCollections.length === 0) {
        console.log('  No message threads found');
    }
    for (const chatDoc of msgCollections) {
        const chats = await chatDoc.collection('chats').orderBy('timestamp', 'desc').limit(3).get();
        console.log(`  Thread ${chatDoc.id}: ${chats.size} recent messages`);
        chats.forEach(doc => {
            const d = doc.data();
            console.log(`    ${doc.id} => sender:${d.senderId}, receiver:${d.receiverId}, friendLinkId:${d.friendLinkId || 'MISSING'}, text:"${(d.text || '').substring(0, 30)}", read:${d.read}`);
        });
    }

    console.log('\n=== BLOCKS ===');
    const blocks = await db.collection('blocks').get();
    if (blocks.empty) {
        console.log('  No blocks');
    }
    blocks.forEach(doc => {
        const d = doc.data();
        console.log(`  ${doc.id} => ${d.blockedBy} blocked ${d.blockedUser}`);
    });

    console.log('\n=== CHAT SETTINGS ===');
    const settings = await db.collection('chatSettings').get();
    if (settings.empty) {
        console.log('  No chat settings');
    }
    settings.forEach(doc => {
        const d = doc.data();
        console.log(`  ${doc.id} => userId:${d.userId}, friendId:${d.friendId}, friendLinkId:${d.friendLinkId || 'MISSING'}`);
    });

    // Validate friendship pairs
    console.log('\n=== FRIENDSHIP VALIDATION ===');
    const friendDocs = {};
    friends.forEach(doc => {
        const d = doc.data();
        if (!friendDocs[d.userId]) friendDocs[d.userId] = [];
        friendDocs[d.userId].push({ docId: doc.id, ...d });
    });

    for (const [userId, friendEntries] of Object.entries(friendDocs)) {
        for (const entry of friendEntries) {
            const reverseId = `${entry.friendId}_${userId}`;
            const forwardId = `${userId}_${entry.friendId}`;
            const hasDeterministicForward = friends.docs.some(d => d.id === forwardId);
            const hasDeterministicReverse = friends.docs.some(d => d.id === reverseId);
            const hasReverse = friends.docs.some(d => d.data().userId === entry.friendId && d.data().friendId === userId);

            console.log(`  ${userMap[userId]?.fullName || userId} <-> ${userMap[entry.friendId]?.fullName || entry.friendId}:`);
            console.log(`    Forward doc (${forwardId}): ${hasDeterministicForward ? 'EXISTS' : 'MISSING'}`);
            console.log(`    Reverse doc (${reverseId}): ${hasDeterministicReverse ? 'EXISTS' : 'MISSING'}`);
            console.log(`    areFriends() would: ${hasDeterministicForward && hasDeterministicReverse ? 'PASS' : 'FAIL'}`);
            console.log(`    hasFriendLink(${entry.docId}) would: ${hasReverse ? 'PASS (if fields match)' : 'FAIL (no reverse)'}`);
        }
    }
}

diagnose().then(() => {
    console.log('\nDone!');
    process.exit(0);
}).catch(e => {
    console.error('ERROR:', e.message);
    process.exit(1);
});
