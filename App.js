import React, { useState, useEffect, useRef } from "react";
import * as ImagePicker from "expo-image-picker";
import {
    SafeAreaView,
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ScrollView,
    FlatList,
    StatusBar,
    Modal,
    Alert,
    StyleSheet,
    Image,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

let firebaseAuth = null;
let firebaseFirestore = null;

const getAuth = () => {
    if (!firebaseAuth) {
        try {
            firebaseAuth = require('@react-native-firebase/auth').default;
        } catch (error) {
            console.error("Firebase auth module failed to load", error);
            throw error;
        }
    }
    return firebaseAuth();
};

const getFirestore = () => {
    if (!firebaseFirestore) {
        try {
            firebaseFirestore = require('@react-native-firebase/firestore').default;
        } catch (error) {
            console.error("Firebase firestore module failed to load", error);
            throw error;
        }
    }
    return firebaseFirestore();
};

const getFirestoreModule = () => {
    if (!firebaseFirestore) {
        try {
            firebaseFirestore = require('@react-native-firebase/firestore').default;
        } catch (error) {
            console.error("Firebase firestore module failed to load", error);
            throw error;
        }
    }
    return firebaseFirestore;
};

const STORAGE_KEYS = {
    SESSION: "APP_SESSION",
};

const AVATAR_COLORS = [
    "#3B82F6", "#4CAF50", "#9C27B0", "#FF9800", "#795548",
    "#E91E63", "#009688", "#3F51B5", "#FF5722", "#607D8B",
];

export default function App() {
    const [isLoading, setIsLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState(null);
    const [screen, setScreen] = useState("welcome");
    const [startupError, setStartupError] = useState(null);
    const [startupRetryCount, setStartupRetryCount] = useState(0);

    // Login State
    const [loginEmail, setLoginEmail] = useState("");
    const [loginPassword, setLoginPassword] = useState("");
    const [loginLoading, setLoginLoading] = useState(false);

    // Register State
    const [regFullName, setRegFullName] = useState("");
    const [regEmail, setRegEmail] = useState("");
    const [regPassword, setRegPassword] = useState("");
    const [regConfirmPassword, setRegConfirmPassword] = useState("");
    const [agreeTerms, setAgreeTerms] = useState(false);

    // Profile State
    const [editingProfile, setEditingProfile] = useState(false);
    const [editName, setEditName] = useState("");

    // Chat State
    const [chatMessages, setChatMessages] = useState({});
    const [selectedFriend, setSelectedFriend] = useState(null);
    const [messageText, setMessageText] = useState("");
    const flatListRef = useRef(null);

    useEffect(() => {
        if (screen !== "chat" || !selectedFriend || !currentUser) return;
        const chatId = [currentUser.uid, selectedFriend.id].sort().join('_');
        const messages = chatMessages[chatId] || [];

        const markRead = async () => {
            const unreadMessages = messages.filter(m => m.senderId === selectedFriend.id && !m.read);
            for (const msg of unreadMessages) {
                await getFirestore()
                    .collection('messages')
                    .doc(chatId)
                    .collection('chats')
                    .doc(msg.id)
                    .update({ read: true });
            }
        };

        markRead();
    }, [screen, selectedFriend, currentUser, chatMessages]);

    // Friend System State
    const [friendsList, setFriendsList] = useState([]);
    const [friendRequests, setFriendRequests] = useState([]);
    const [allUsers, setAllUsers] = useState([]);

    // UI State
    const [searchQuery, setSearchQuery] = useState("");
    const [viewProfileUser, setViewProfileUser] = useState(null);

    // Modals
    const [termsModalVisible, setTermsModalVisible] = useState(false);
    const [privacyModalVisible, setPrivacyModalVisible] = useState(false);

    // Helper Functions
    const generateUserColor = (uid) => {
        const hash = uid?.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) || 0;
        return AVATAR_COLORS[hash % AVATAR_COLORS.length];
    };

    const formatTime = (timestamp) => {
        if (!timestamp) return "";
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        if (diff < 60000) return "Just now";
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    };

    // Navigation
    const goBack = () => {
        if (screen === "register") setScreen("welcome");
        else if (screen === "home") setScreen("dashboard");
        else if (screen === "chat") setScreen("home");
        else if (screen === "friendRequests") setScreen("dashboard");
        else if (screen === "profile") setScreen("dashboard");
        else if (screen === "findFriends") setScreen("dashboard");
        else if (screen === "userPreview") setScreen("findFriends");
        else setScreen("dashboard");
    };

    const handleStartupRetry = () => {
        setStartupError(null);
        setIsLoading(true);
        setStartupRetryCount(prev => prev + 1);
    };

    // ==================== FIREBASE AUTH STATE ====================
    useEffect(() => {
        let unsubscribe = null;
        try {
            unsubscribe = getAuth().onAuthStateChanged(async (user) => {
                try {
                    if (user) {
                        if (!user.emailVerified) {
                            setIsLoading(false);
                            return;
                        }
                        const userDoc = await getFirestore().collection('users').doc(user.uid).get();
                        if (userDoc.exists) {
                            setCurrentUser({ uid: user.uid, ...userDoc.data() });
                            setScreen("dashboard");
                        } else {
                            await getFirestore().collection('users').doc(user.uid).set({
                                uid: user.uid,
                                fullName: user.email?.split('@')[0] || "User",
                                email: user.email,
                                bio: "New member",
                                createdAt: getFirestoreModule().FieldValue.serverTimestamp(),
                            });
                            setCurrentUser({ uid: user.uid, fullName: user.email?.split('@')[0], email: user.email });
                            setScreen("dashboard");
                        }
                    } else {
                        setCurrentUser(null);
                        if (screen !== "welcome" && screen !== "register") {
                            setScreen("welcome");
                        }
                    }
                } catch (error) {
                    console.error("Firebase runtime error", error);
                    setStartupError("Firebase failed to initialize. Please add a valid android/app/google-services.json and rebuild.");
                } finally {
                    setIsLoading(false);
                }
            });
        } catch (error) {
            console.error("Firebase startup failed", error);
            setStartupError("Firebase failed to initialize. Please add a valid android/app/google-services.json and rebuild.");
            setIsLoading(false);
        }
        return () => unsubscribe && unsubscribe();
    }, [startupRetryCount]);

    // ==================== FIREBASE LISTENERS ====================

    useEffect(() => {
        if (!currentUser) return;
        const unsubscribe = getFirestore()
            .collection('friendRequests')
            .where('to', '==', currentUser.uid)
            .onSnapshot((snapshot) => {
                const requests = [];
                snapshot.forEach(doc => {
                    requests.push({ id: doc.id, ...doc.data() });
                });
                setFriendRequests(requests);
            });
        return () => unsubscribe();
    }, [currentUser]);

    useEffect(() => {
        if (!currentUser) return;
        const unsubscribe = getFirestore()
            .collection('friends')
            .where('userId', '==', currentUser.uid)
            .onSnapshot(async (snapshot) => {
                const friends = [];
                for (const doc of snapshot.docs) {
                    const friendData = doc.data();
                    const userDoc = await getFirestore().collection('users').doc(friendData.friendId).get();
                    if (userDoc.exists) {
                        friends.push({ id: userDoc.id, ...userDoc.data() });
                    }
                }
                setFriendsList(friends);
            });
        return () => unsubscribe();
    }, [currentUser]);

    useEffect(() => {
        if (!currentUser || !selectedFriend) return;
        const chatId = [currentUser.uid, selectedFriend.id].sort().join('_');
        const unsubscribe = getFirestore()
            .collection('messages')
            .doc(chatId)
            .collection('chats')
            .orderBy('timestamp', 'asc')
            .onSnapshot((snapshot) => {
                const messages = [];
                snapshot.forEach(doc => {
                    messages.push({ id: doc.id, ...doc.data() });
                });
                setChatMessages(prev => ({ ...prev, [chatId]: messages }));
            });
        return () => unsubscribe();
    }, [currentUser, selectedFriend]);

    useEffect(() => {
        if (!currentUser) return;
        const fetchUsers = async () => {
            const snapshot = await getFirestore().collection('users').get();
            const users = [];
            snapshot.forEach(doc => {
                if (doc.id !== currentUser.uid) {
                    users.push({ id: doc.id, ...doc.data() });
                }
            });
            setAllUsers(users);
        };
        fetchUsers();
    }, [currentUser]);

    // ==================== AUTH FUNCTIONS ====================

    const handleLogin = async () => {
        if (!loginEmail || !loginPassword) {
            Alert.alert("Error", "Enter email and password");
            return;
        }
        setLoginLoading(true);
        try {
            const userCredential = await getAuth().signInWithEmailAndPassword(loginEmail, loginPassword);
            if (!userCredential.user.emailVerified) {
                await userCredential.user.sendEmailVerification();
                await getAuth().signOut();
                Alert.alert(
                    "Email Not Verified",
                    "Please verify your email first. A new verification link has been sent to your inbox."
                );
                return;
            }
            Alert.alert("Welcome", "Logged in successfully!");
        } catch (error) {
            Alert.alert("Error", error.message);
        } finally {
            setLoginLoading(false);
        }
    };

    const handleRegister = async () => {
        if (!regFullName || !regEmail || !regPassword || !regConfirmPassword) {
            Alert.alert("Error", "Fill all required fields");
            return;
        }
        if (regPassword !== regConfirmPassword) {
            Alert.alert("Error", "Passwords don't match");
            return;
        }
        if (regPassword.length < 6) {
            Alert.alert("Error", "Password must be at least 6 characters");
            return;
        }
        if (!agreeTerms) {
            Alert.alert("Error", "Accept Terms & Conditions");
            return;
        }

        setLoginLoading(true);
        try {
            const userCredential = await getAuth().createUserWithEmailAndPassword(regEmail, regPassword);
            await userCredential.user.sendEmailVerification();
            await getFirestore().collection('users').doc(userCredential.user.uid).set({
                uid: userCredential.user.uid,
                fullName: regFullName,
                email: regEmail,
                bio: "New member",
                createdAt: getFirestoreModule().FieldValue.serverTimestamp(),
            });
            await getAuth().signOut();
            Alert.alert(
                "Verify Your Email",
                "A verification link has been sent to " + regEmail + ". Please check your inbox (and spam folder) and verify your email before logging in."
            );
            setRegFullName(""); setRegEmail("");
            setRegPassword(""); setRegConfirmPassword(""); setAgreeTerms(false);
            setScreen("welcome");
        } catch (error) {
            Alert.alert("Error", error.message);
        } finally {
            setLoginLoading(false);
        }
    };

    const handleLogout = async () => {
        Alert.alert("Logout", "Are you sure?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Logout",
                onPress: async () => {
                    await getAuth().signOut();
                    await AsyncStorage.removeItem(STORAGE_KEYS.SESSION);
                    setCurrentUser(null);
                    setScreen("welcome");
                },
            },
        ]);
    };

    const deleteAccount = () => {
        Alert.alert("Delete Account", "⚠️ This will permanently delete ALL your data!", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete",
                style: "destructive",
                onPress: async () => {
                    const user = getAuth().currentUser;
                    if (user) {
                        await getFirestore().collection('users').doc(user.uid).delete();
                        await user.delete();
                        Alert.alert("Deleted", "Your account has been deleted");
                    }
                },
            },
        ]);
    };

    // ==================== FRIEND FUNCTIONS ====================

    const sendFriendRequest = async (toUserId, toUserName) => {
        const existing = await getFirestore()
            .collection('friendRequests')
            .where('from', '==', currentUser.uid)
            .where('to', '==', toUserId)
            .get();
        if (!existing.empty) {
            Alert.alert("Info", "Request already sent");
            return;
        }
        await getFirestore().collection('friendRequests').add({
            from: currentUser.uid,
            fromName: currentUser.fullName,
            to: toUserId,
            toName: toUserName,
            status: 'pending',
            timestamp: getFirestoreModule().FieldValue.serverTimestamp(),
        });
        Alert.alert("Success", "Friend request sent");
    };

    const acceptFriendRequest = async (request) => {
        await getFirestore().collection('friends').add({
            userId: currentUser.uid,
            friendId: request.from,
            friendName: request.fromName,
            addedAt: getFirestoreModule().FieldValue.serverTimestamp(),
        });
        await getFirestore().collection('friends').add({
            userId: request.from,
            friendId: currentUser.uid,
            friendName: currentUser.fullName,
            addedAt: getFirestoreModule().FieldValue.serverTimestamp(),
        });
        await getFirestore().collection('friendRequests').doc(request.id).delete();
        Alert.alert("Success", `${request.fromName} is now your friend!`);
    };

    const declineFriendRequest = async (requestId) => {
        await getFirestore().collection('friendRequests').doc(requestId).delete();
        Alert.alert("Info", "Request declined");
    };

    const removeFriend = async (friendId, friendName) => {
        Alert.alert("Remove Friend", `Remove ${friendName} from friends?`, [
            { text: "Cancel", style: "cancel" },
            {
                text: "Remove",
                style: "destructive",
                onPress: async () => {
                    const friendsSnapshot = await getFirestore()
                        .collection('friends')
                        .where('userId', '==', currentUser.uid)
                        .where('friendId', '==', friendId)
                        .get();
                    friendsSnapshot.forEach(async (doc) => {
                        await doc.ref.delete();
                    });
                    Alert.alert("Removed", `${friendName} removed from friends`);
                },
            },
        ]);
    };

    // ==================== CHAT FUNCTIONS ====================

    const sendMessage = async () => {
        if (!messageText.trim() || !selectedFriend) return;
        const chatId = [currentUser.uid, selectedFriend.id].sort().join('_');
        const newMessage = {
            text: messageText.trim(),
            senderId: currentUser.uid,
            senderName: currentUser.fullName,
            receiverId: selectedFriend.id,
            timestamp: getFirestoreModule().FieldValue.serverTimestamp(),
            read: false,
        };
        await getFirestore()
            .collection('messages')
            .doc(chatId)
            .collection('chats')
            .add(newMessage);
        setMessageText("");
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    };

    // ==================== TERMS & PRIVACY CONTENT ====================
    const TermsContent = () => (
        <ScrollView style={styles.termsContainer}>
            <Text style={styles.termsTitle}>Terms & Conditions</Text>
            <Text style={styles.termsHeading}>1. Acceptance of Terms</Text>
            <Text style={styles.termsText}>By creating an account and using ChatConnect, you agree to be bound by these Terms & Conditions.</Text>
            <Text style={styles.termsHeading}>2. User Conduct</Text>
            <Text style={styles.termsText}>Be respectful to other users. No harassment, hate speech, or bullying.</Text>
            <Text style={styles.termsHeading}>3. Privacy</Text>
            <Text style={styles.termsText}>Your privacy is important. Read our Privacy Policy for more information.</Text>
            <Text style={styles.termsHeading}>4. Age Requirement</Text>
            <Text style={styles.termsText}>You must be at least 13 years old to use this application.</Text>
            <Text style={styles.termsHeading}>5. Account Termination</Text>
            <Text style={styles.termsText}>We reserve the right to suspend or terminate accounts that violate these terms.</Text>
            <Text style={styles.termsText}>Last updated: April 2026</Text>
        </ScrollView>
    );

    const PrivacyContent = () => (
        <ScrollView style={styles.termsContainer}>
            <Text style={styles.termsTitle}>Privacy Policy</Text>
            <Text style={styles.termsHeading}>1. Information We Collect</Text>
            <Text style={styles.termsText}>We collect account information (name, email), profile photos, and chat messages.</Text>
            <Text style={styles.termsHeading}>2. How We Use Your Information</Text>
            <Text style={styles.termsText}>To provide messaging features, connect you with friends, and improve the app.</Text>
            <Text style={styles.termsHeading}>3. Data Storage</Text>
            <Text style={styles.termsText}>All data is stored securely using Firebase.</Text>
            <Text style={styles.termsHeading}>4. Data Sharing</Text>
            <Text style={styles.termsText}>We do not sell or share your personal information with third parties.</Text>
            <Text style={styles.termsHeading}>5. Your Rights</Text>
            <Text style={styles.termsText}>You can delete your account anytime from Profile Settings.</Text>
            <Text style={styles.termsText}>Last updated: April 2026</Text>
        </ScrollView>
    );

    // ==================== STARTUP ERROR SCREEN ====================
    if (startupError) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.errorContainer}>
                    <Text style={styles.errorTitle}>Initialization Error</Text>
                    <Text style={styles.errorText}>{startupError}</Text>
                    <TouchableOpacity style={styles.button} onPress={handleStartupRetry}>
                        <Text style={styles.buttonText}>Retry</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    // ==================== LOADING SCREEN ====================
    if (isLoading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#3B82F6" />
                    <Text style={styles.loadingText}>Loading...</Text>
                </View>
            </SafeAreaView>
        );
    }

    // ==================== WELCOME SCREEN ====================
    if (screen === "welcome") {
        return (
            <SafeAreaView style={styles.container}>
                <StatusBar backgroundColor="#3B82F6" barStyle="light-content" />
                <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
                    <ScrollView contentContainerStyle={styles.scrollContainer}>
                        <View style={styles.loginContainer}>
                            <Text style={styles.logo}>💬</Text>
                            <Text style={styles.title}>ChatConnect</Text>
                            <Text style={styles.subtitle}>Connect with friends</Text>
                            <TextInput style={styles.input} placeholder="Email" value={loginEmail} onChangeText={setLoginEmail} autoCapitalize="none" keyboardType="email-address" />
                            <TextInput style={styles.input} placeholder="Password" secureTextEntry value={loginPassword} onChangeText={setLoginPassword} />
                            <TouchableOpacity style={[styles.button, loginLoading && styles.buttonDisabled]} onPress={handleLogin} disabled={loginLoading}>
                                <Text style={styles.buttonText}>{loginLoading ? "Logging in..." : "Login"}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setScreen("register")}>
                                <Text style={styles.linkText}>Create New Account</Text>
                            </TouchableOpacity>
                            <View style={styles.footerLinks}>
                                <TouchableOpacity onPress={() => setTermsModalVisible(true)}><Text style={styles.footerLinkText}>Terms</Text></TouchableOpacity>
                                <Text style={styles.footerLinkSeparator}>•</Text>
                                <TouchableOpacity onPress={() => setPrivacyModalVisible(true)}><Text style={styles.footerLinkText}>Privacy</Text></TouchableOpacity>
                            </View>
                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>
                <Modal visible={termsModalVisible} animationType="slide" transparent={false}>
                    <SafeAreaView style={styles.modalFullContainer}>
                        <View style={styles.modalFullHeader}><TouchableOpacity onPress={() => setTermsModalVisible(false)}><Text style={styles.modalFullClose}>← Back</Text></TouchableOpacity><Text style={styles.modalFullTitle}>Terms & Conditions</Text><View style={{ width: 50 }} /></View>
                        <TermsContent />
                    </SafeAreaView>
                </Modal>
                <Modal visible={privacyModalVisible} animationType="slide" transparent={false}>
                    <SafeAreaView style={styles.modalFullContainer}>
                        <View style={styles.modalFullHeader}><TouchableOpacity onPress={() => setPrivacyModalVisible(false)}><Text style={styles.modalFullClose}>← Back</Text></TouchableOpacity><Text style={styles.modalFullTitle}>Privacy Policy</Text><View style={{ width: 50 }} /></View>
                        <PrivacyContent />
                    </SafeAreaView>
                </Modal>
            </SafeAreaView>
        );
    }

    // ==================== REGISTER SCREEN ====================
    if (screen === "register") {
        return (
            <SafeAreaView style={styles.container}>
                <StatusBar backgroundColor="#3B82F6" barStyle="light-content" />
                <TouchableOpacity style={styles.backButton} onPress={goBack}>
                    <Text style={styles.backTextWhite}>← Back</Text>
                </TouchableOpacity>
                <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
                    <ScrollView contentContainerStyle={styles.scrollContainer}>
                        <View style={styles.registerContainer}>
                            <Text style={styles.title}>Create Account</Text>
                            <TextInput style={styles.input} placeholder="Full Name *" value={regFullName} onChangeText={setRegFullName} />
                            <TextInput style={styles.input} placeholder="Email (Gmail) *" value={regEmail} onChangeText={setRegEmail} keyboardType="email-address" autoCapitalize="none" />
                            <TextInput style={styles.input} placeholder="Password * (min 6)" secureTextEntry value={regPassword} onChangeText={setRegPassword} />
                            <TextInput style={styles.input} placeholder="Confirm Password *" secureTextEntry value={regConfirmPassword} onChangeText={setRegConfirmPassword} />
                            <View style={styles.checkboxRow}>
                                <TouchableOpacity style={styles.checkbox} onPress={() => setAgreeTerms(!agreeTerms)}>
                                    <Text style={styles.checkboxText}>{agreeTerms ? "✅" : "⬜"}</Text>
                                </TouchableOpacity>
                                <Text style={styles.checkboxLabel}>I agree to the </Text>
                                <TouchableOpacity onPress={() => setTermsModalVisible(true)}><Text style={styles.linkTextInline}>Terms</Text></TouchableOpacity>
                            </View>
                            <TouchableOpacity style={styles.button} onPress={handleRegister}><Text style={styles.buttonText}>Register</Text></TouchableOpacity>
                            <TouchableOpacity onPress={goBack}><Text style={styles.linkText}>Already have an account? Login</Text></TouchableOpacity>
                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>
                <Modal visible={termsModalVisible} animationType="slide" transparent={false}>
                    <SafeAreaView style={styles.modalFullContainer}>
                        <View style={styles.modalFullHeader}><TouchableOpacity onPress={() => setTermsModalVisible(false)}><Text style={styles.modalFullClose}>← Back</Text></TouchableOpacity><Text style={styles.modalFullTitle}>Terms & Conditions</Text><View style={{ width: 50 }} /></View>
                        <TermsContent />
                    </SafeAreaView>
                </Modal>
            </SafeAreaView>
        );
    }

    // ==================== DASHBOARD SCREEN ====================
    if (screen === "dashboard" && currentUser) {
        const pendingCount = friendRequests.length;
        return (
            <SafeAreaView style={styles.container}>
                <StatusBar backgroundColor="#3B82F6" barStyle="light-content" />
                <View style={styles.dashboardHeader}>
                    <TouchableOpacity onPress={() => setScreen("profile")} style={styles.profileButton}>
                        <View style={[styles.headerAvatarPlaceholder, { backgroundColor: generateUserColor(currentUser.uid) }]}>
                            <Text style={styles.headerAvatarText}>{currentUser.fullName?.charAt(0)}</Text>
                        </View>
                        <View>
                            <Text style={styles.welcomeText}>Hello, {currentUser.fullName}</Text>
                            <Text style={styles.statsText}>{friendsList.length} friends • {pendingCount} requests</Text>
                        </View>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleLogout}><Text style={styles.logoutText}>Logout</Text></TouchableOpacity>
                </View>
                <View style={styles.statsRow}>
                    <View style={styles.statCard}><Text style={styles.statNumber}>{friendsList.length}</Text><Text style={styles.statLabel}>Friends</Text></View>
                    <View style={styles.statCard}><Text style={styles.statNumber}>{pendingCount}</Text><Text style={styles.statLabel}>Requests</Text></View>
                    <View style={styles.statCard}><Text style={styles.statNumber}>{Object.keys(chatMessages).length}</Text><Text style={styles.statLabel}>Chats</Text></View>
                </View>
                <View style={styles.navRow}>
                    <TouchableOpacity style={styles.navButton} onPress={() => setScreen("home")}><Text style={styles.navText}>💬 Chats</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.navButton} onPress={() => setScreen("friendRequests")}><Text style={styles.navText}>👥 Requests</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.navButton} onPress={() => setScreen("findFriends")}><Text style={styles.navText}>🔍 Find</Text></TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    // ==================== HOME/CHATS SCREEN ====================
    if (screen === "home" && currentUser) {
        const filteredFriends = friendsList.filter(f =>
            f.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            f.email?.toLowerCase().includes(searchQuery.toLowerCase())
        );
        return (
            <SafeAreaView style={styles.container}>
                <StatusBar backgroundColor="#3B82F6" barStyle="light-content" />
                <View style={styles.header}>
                    <TouchableOpacity onPress={goBack}><Text style={styles.backTextWhite}>← Back</Text></TouchableOpacity>
                    <Text style={styles.headerTitle}>Chats</Text>
                    <View style={{ width: 50 }} />
                </View>
                <View style={styles.searchBar}><TextInput style={styles.searchInput} placeholder="Search friends..." value={searchQuery} onChangeText={setSearchQuery} /></View>
                {friendsList.length === 0 ? (
                    <View style={styles.emptyState}><Text style={styles.emptyText}>No friends yet</Text><TouchableOpacity onPress={() => setScreen("findFriends")}><Text style={styles.linkText}>Find friends</Text></TouchableOpacity></View>
                ) : (
                    <FlatList
                        data={filteredFriends}
                        keyExtractor={item => item.id}
                        renderItem={({ item }) => {
                            const chatId = [currentUser.uid, item.id].sort().join('_');
                            const messages = chatMessages[chatId] || [];
                            const lastMsg = messages[messages.length - 1];
                            return (
                                <TouchableOpacity style={styles.chatItem} onPress={() => { setSelectedFriend(item); setScreen("chat"); }}>
                                    <View style={styles.avatarContainer}>
                                        <View style={[styles.avatarPlaceholder, { backgroundColor: generateUserColor(item.uid) }]}>
                                            <Text style={styles.avatarText}>{item.fullName?.charAt(0)}</Text>
                                        </View>
                                    </View>
                                    <View style={styles.chatInfo}>
                                        <Text style={styles.chatName}>{item.fullName}</Text>
                                        <Text style={styles.chatPreview} numberOfLines={1}>
                                            {lastMsg ? (lastMsg.senderId === currentUser.uid ? `You: ${lastMsg.text}` : lastMsg.text) : "Tap to start chatting"}
                                        </Text>
                                    </View>
                                    <View style={styles.chatRight}>
                                        {lastMsg && <Text style={styles.chatTime}>{formatTime(lastMsg.timestamp)}</Text>}
                                    </View>
                                </TouchableOpacity>
                            );
                        }}
                    />
                )}
            </SafeAreaView>
        );
    }

    // ==================== CHAT SCREEN ====================
    if (screen === "chat" && selectedFriend && currentUser) {
        const chatId = [currentUser.uid, selectedFriend.id].sort().join('_');
        const messages = chatMessages[chatId] || [];
        const sortedMessages = [...messages].sort((a, b) => (a.timestamp?.toDate?.() || 0) - (b.timestamp?.toDate?.() || 0));

        return (
            <SafeAreaView style={styles.container}>
                <StatusBar backgroundColor="#3B82F6" barStyle="light-content" />
                <View style={styles.chatHeader}>
                    <TouchableOpacity onPress={goBack}><Text style={styles.backTextWhite}>← Back</Text></TouchableOpacity>
                    <View style={styles.chatHeaderInfo}>
                        <View style={[styles.chatAvatarPlaceholder, { backgroundColor: generateUserColor(selectedFriend.uid) }]}>
                            <Text style={styles.chatAvatarText}>{selectedFriend.fullName?.charAt(0)}</Text>
                        </View>
                        <Text style={styles.chatHeaderName}>{selectedFriend.fullName}</Text>
                    </View>
                    <TouchableOpacity onPress={() => removeFriend(selectedFriend.id, selectedFriend.fullName)}>
                        <Text style={styles.removeIcon}>⋯</Text>
                    </TouchableOpacity>
                </View>
                <FlatList
                    ref={flatListRef}
                    data={sortedMessages}
                    keyExtractor={item => item.id}
                    style={styles.messagesList}
                    contentContainerStyle={styles.messagesContainer}
                    onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                    renderItem={({ item }) => {
                        const isMyMessage = item.senderId === currentUser.uid;
                        return (
                            <View style={[styles.messageRow, isMyMessage ? styles.myMessageRow : styles.theirMessageRow]}>
                                <View style={[styles.messageBubble, isMyMessage ? styles.myBubble : styles.theirBubble]}>
                                    <Text style={[styles.messageText, isMyMessage ? styles.myMessageText : styles.theirMessageText]}>{item.text}</Text>
                                    <View style={styles.messageFooter}>
                                        <Text style={styles.messageTime}>{formatTime(item.timestamp)}</Text>
                                        {isMyMessage && <Text style={styles.messageStatus}>{item.read ? "✓✓" : "✓"}</Text>}
                                    </View>
                                </View>
                            </View>
                        );
                    }}
                />
                <View style={styles.inputContainer}>
                    <TextInput style={styles.messageInput} placeholder="Type a message..." value={messageText} onChangeText={setMessageText} multiline />
                    <TouchableOpacity style={[styles.sendButton, !messageText.trim() && styles.sendButtonDisabled]} onPress={sendMessage} disabled={!messageText.trim()}>
                        <Text style={styles.sendText}>Send</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    // ==================== FRIEND REQUESTS SCREEN ====================
    if (screen === "friendRequests" && currentUser) {
        return (
            <SafeAreaView style={styles.container}>
                <StatusBar backgroundColor="#3B82F6" barStyle="light-content" />
                <View style={styles.header}>
                    <TouchableOpacity onPress={goBack}><Text style={styles.backTextWhite}>← Back</Text></TouchableOpacity>
                    <Text style={styles.headerTitle}>Friend Requests</Text>
                    <View style={{ width: 50 }} />
                </View>
                {friendRequests.length === 0 ? (
                    <View style={styles.emptyState}><Text style={styles.emptyText}>No pending requests</Text></View>
                ) : (
                    <FlatList
                        data={friendRequests}
                        keyExtractor={item => item.id}
                        renderItem={({ item }) => (
                            <View style={styles.requestCard}>
                                <View style={styles.requestInfo}>
                                    <View style={[styles.requestAvatar, { backgroundColor: generateUserColor(item.from) }]}>
                                        <Text style={styles.avatarText}>{item.fromName?.charAt(0)}</Text>
                                    </View>
                                    <View style={styles.requestDetails}>
                                        <Text style={styles.requestName}>{item.fromName}</Text>
                                        <Text style={styles.requestText}>Wants to be your friend</Text>
                                    </View>
                                </View>
                                <View style={styles.requestButtons}>
                                    <TouchableOpacity style={styles.acceptButton} onPress={() => acceptFriendRequest(item)}><Text style={styles.acceptText}>Accept</Text></TouchableOpacity>
                                    <TouchableOpacity style={styles.declineButton} onPress={() => declineFriendRequest(item.id)}><Text style={styles.declineText}>Decline</Text></TouchableOpacity>
                                </View>
                            </View>
                        )}
                    />
                )}
            </SafeAreaView>
        );
    }

    // ==================== PROFILE SCREEN ====================
    if (screen === "profile" && currentUser) {
        return (
            <SafeAreaView style={styles.container}>
                <StatusBar backgroundColor="#3B82F6" barStyle="light-content" />
                <View style={styles.header}>
                    <TouchableOpacity onPress={goBack}><Text style={styles.backTextWhite}>← Back</Text></TouchableOpacity>
                    <Text style={styles.headerTitle}>My Profile</Text>
                    <View style={{ width: 50 }} />
                </View>
                <ScrollView>
                    <View style={styles.profileHeader}>
                        <View style={[styles.profileImagePlaceholder, { backgroundColor: generateUserColor(currentUser.uid) }]}>
                            <Text style={styles.profileImageText}>{currentUser.fullName?.charAt(0)}</Text>
                        </View>
                        {editingProfile ? (
                            <>
                                <TextInput style={styles.editInput} value={editName} onChangeText={setEditName} placeholder="Full Name" />
                                <View style={styles.editButtons}>
                                    <TouchableOpacity onPress={() => setEditingProfile(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
                                    <TouchableOpacity onPress={async () => {
                                        await getFirestore().collection('users').doc(currentUser.uid).update({ fullName: editName });
                                        setCurrentUser({ ...currentUser, fullName: editName });
                                        setEditingProfile(false);
                                        Alert.alert("Success", "Profile updated");
                                    }}><Text style={styles.saveText}>Save</Text></TouchableOpacity>
                                </View>
                            </>
                        ) : (
                            <>
                                <Text style={styles.profileName}>{currentUser.fullName}</Text>
                                <Text style={styles.profileUsername}>{currentUser.email}</Text>
                                <Text style={styles.profileBio}>{currentUser.bio}</Text>
                                <TouchableOpacity style={styles.editProfileButton} onPress={() => { setEditingProfile(true); setEditName(currentUser.fullName); }}>
                                    <Text style={styles.editProfileText}>Edit Profile</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                    <View style={styles.infoSection}>
                        <Text style={styles.sectionTitle}>Account</Text>
                        <TouchableOpacity style={styles.actionButton} onPress={handleLogout}><Text style={styles.actionText}>Logout</Text></TouchableOpacity>
                        <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={deleteAccount}><Text style={styles.deleteText}>Delete Account</Text></TouchableOpacity>
                    </View>
                    <View style={styles.infoSection}>
                        <Text style={styles.sectionTitle}>Legal</Text>
                        <TouchableOpacity style={styles.actionButton} onPress={() => setTermsModalVisible(true)}><Text style={styles.actionText}>Terms & Conditions</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.actionButton} onPress={() => setPrivacyModalVisible(true)}><Text style={styles.actionText}>Privacy Policy</Text></TouchableOpacity>
                    </View>
                </ScrollView>
                <Modal visible={termsModalVisible} animationType="slide" transparent={false}>
                    <SafeAreaView style={styles.modalFullContainer}>
                        <View style={styles.modalFullHeader}><TouchableOpacity onPress={() => setTermsModalVisible(false)}><Text style={styles.modalFullClose}>← Back</Text></TouchableOpacity><Text style={styles.modalFullTitle}>Terms & Conditions</Text><View style={{ width: 50 }} /></View>
                        <TermsContent />
                    </SafeAreaView>
                </Modal>
                <Modal visible={privacyModalVisible} animationType="slide" transparent={false}>
                    <SafeAreaView style={styles.modalFullContainer}>
                        <View style={styles.modalFullHeader}><TouchableOpacity onPress={() => setPrivacyModalVisible(false)}><Text style={styles.modalFullClose}>← Back</Text></TouchableOpacity><Text style={styles.modalFullTitle}>Privacy Policy</Text><View style={{ width: 50 }} /></View>
                        <PrivacyContent />
                    </SafeAreaView>
                </Modal>
            </SafeAreaView>
        );
    }

    // ==================== FIND FRIENDS SCREEN ====================
    if (screen === "findFriends" && currentUser) {
        const isFriend = (userId) => friendsList.some(f => f.id === userId);
        const isRequestSent = (userId) => friendRequests.some(r => r.from === currentUser.uid && r.to === userId);
        const isRequestReceived = (userId) => friendRequests.some(r => r.from === userId && r.to === currentUser.uid);
        const filteredUsers = allUsers.filter(u =>
            u.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            u.email?.toLowerCase().includes(searchQuery.toLowerCase())
        );
        return (
            <SafeAreaView style={styles.container}>
                <StatusBar backgroundColor="#3B82F6" barStyle="light-content" />
                <View style={styles.header}>
                    <TouchableOpacity onPress={goBack}><Text style={styles.backTextWhite}>← Back</Text></TouchableOpacity>
                    <Text style={styles.headerTitle}>Find Friends</Text>
                    <View style={{ width: 50 }} />
                </View>
                <View style={styles.searchBar}><TextInput style={styles.searchInput} placeholder="Search by name or email..." value={searchQuery} onChangeText={setSearchQuery} /></View>
                <FlatList
                    data={filteredUsers}
                    keyExtractor={item => item.id}
                    renderItem={({ item }) => (
                        <View style={styles.userCard}>
                            <TouchableOpacity style={styles.userInfo} onPress={() => { setViewProfileUser(item); setScreen("userPreview"); }}>
                                <View style={[styles.userAvatarPlaceholder, { backgroundColor: generateUserColor(item.id) }]}>
                                    <Text style={styles.avatarText}>{item.fullName?.charAt(0)}</Text>
                                </View>
                                <View>
                                    <Text style={styles.userName}>{item.fullName}</Text>
                                    <Text style={styles.userUsername}>{item.email}</Text>
                                </View>
                            </TouchableOpacity>
                            {isFriend(item.id) ? (
                                <Text style={styles.friendBadge}>✓ Friend</Text>
                            ) : isRequestSent(item.id) ? (
                                <Text style={styles.pendingBadge}>⏳ Pending</Text>
                            ) : isRequestReceived(item.id) ? (
                                <TouchableOpacity style={styles.acceptFriendButton} onPress={() => {
                                    const request = friendRequests.find(r => r.from === item.id);
                                    if (request) acceptFriendRequest(request);
                                }}><Text style={styles.acceptFriendText}>Accept</Text></TouchableOpacity>
                            ) : (
                                <TouchableOpacity style={styles.addButton} onPress={() => sendFriendRequest(item.id, item.fullName)}>
                                    <Text style={styles.addButtonText}>+ Add</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}
                    ListEmptyComponent={() => <View style={styles.emptyState}><Text style={styles.emptyText}>No users found</Text></View>}
                />
            </SafeAreaView>
        );
    }

    // ==================== USER PREVIEW SCREEN ====================
    if (screen === "userPreview" && viewProfileUser && currentUser) {
        const isFriend = friendsList.some(f => f.id === viewProfileUser.id);
        return (
            <SafeAreaView style={styles.container}>
                <StatusBar backgroundColor="#3B82F6" barStyle="light-content" />
                <View style={styles.header}>
                    <TouchableOpacity onPress={goBack}><Text style={styles.backTextWhite}>← Back</Text></TouchableOpacity>
                    <Text style={styles.headerTitle}>User Profile</Text>
                    <View style={{ width: 50 }} />
                </View>
                <View style={styles.profileHeader}>
                    <View style={[styles.profileImagePlaceholder, { backgroundColor: generateUserColor(viewProfileUser.id) }]}>
                        <Text style={styles.profileImageText}>{viewProfileUser.fullName?.charAt(0)}</Text>
                    </View>
                    <Text style={styles.profileName}>{viewProfileUser.fullName}</Text>
                    <Text style={styles.profileUsername}>{viewProfileUser.email}</Text>
                    <Text style={styles.profileBio}>{viewProfileUser.bio}</Text>
                    {isFriend ? (
                        <>
                            <TouchableOpacity style={styles.messageButton} onPress={() => { setSelectedFriend(viewProfileUser); setScreen("chat"); }}>
                                <Text style={styles.messageButtonText}>💬 Send Message</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.removeFriendButton} onPress={() => removeFriend(viewProfileUser.id, viewProfileUser.fullName)}>
                                <Text style={styles.removeFriendText}>Remove Friend</Text>
                            </TouchableOpacity>
                        </>
                    ) : (
                        <TouchableOpacity style={styles.addFriendButton} onPress={() => sendFriendRequest(viewProfileUser.id, viewProfileUser.fullName)}>
                            <Text style={styles.addFriendText}>➕ Add Friend</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </SafeAreaView>
        );
    }

    return null;
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#f5f5f5" },
    loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
    loadingText: { marginTop: 10, fontSize: 16, color: "#666" },
    scrollContainer: { flexGrow: 1, justifyContent: "center", padding: 20 },
    backButton: { position: "absolute", top: 50, left: 20, zIndex: 1 },
    backTextWhite: { fontSize: 16, color: "#FFFFFF", fontWeight: "600" },
    loginContainer: { backgroundColor: "white", borderRadius: 24, padding: 28, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 5 },
    registerContainer: { backgroundColor: "white", borderRadius: 24, padding: 28, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 5 },
    logo: { fontSize: 62, textAlign: "center", marginBottom: 10 },
    title: { fontSize: 30, fontWeight: "800", color: "#3B82F6", textAlign: "center", marginBottom: 8 },
    subtitle: { fontSize: 15, color: "#666", textAlign: "center", marginBottom: 28 },
    input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 16, padding: 14, fontSize: 16, marginBottom: 15, backgroundColor: "#fff" },
    editInput: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 12, fontSize: 16, marginTop: 15, width: "80%" },
    button: { backgroundColor: "#3B82F6", padding: 16, borderRadius: 16, alignItems: "center", marginBottom: 15 },
    buttonDisabled: { backgroundColor: "#93C5FD" },
    buttonText: { color: "white", fontSize: 16, fontWeight: "bold" },
    linkText: { color: "#6366F1", fontSize: 14, textAlign: "center", marginTop: 10, fontWeight: "600" },
    linkTextInline: { color: "#6366F1", fontSize: 14, fontWeight: "600" },
    footerLinks: { flexDirection: "row", justifyContent: "center", marginTop: 20 },
    footerLinkText: { color: "#666", fontSize: 12 },
    footerLinkSeparator: { color: "#666", marginHorizontal: 10 },
    checkboxRow: { flexDirection: "row", alignItems: "center", marginBottom: 20, flexWrap: "wrap" },
    checkbox: { marginRight: 8 },
    checkboxText: { fontSize: 20 },
    checkboxLabel: { fontSize: 14, color: "#666" },
    dashboardHeader: { backgroundColor: "#3B82F6", padding: 20, paddingTop: 50, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    profileButton: { flexDirection: "row", alignItems: "center", flex: 1 },
    headerAvatarPlaceholder: { width: 50, height: 50, borderRadius: 25, justifyContent: "center", alignItems: "center", marginRight: 12 },
    headerAvatarText: { color: "white", fontSize: 20, fontWeight: "bold" },
    welcomeText: { color: "white", fontSize: 18, fontWeight: "bold" },
    statsText: { color: "rgba(255,255,255,0.9)", fontSize: 12, marginTop: 2 },
    logoutText: { color: "white", fontSize: 14, fontWeight: "600" },
    statsRow: { flexDirection: "row", justifyContent: "space-around", padding: 20, backgroundColor: "white", margin: 15, borderRadius: 20 },
    statCard: { alignItems: "center" },
    statNumber: { fontSize: 24, fontWeight: "bold", color: "#3B82F6" },
    statLabel: { fontSize: 12, color: "#666", marginTop: 5 },
    navRow: { flexDirection: "row", justifyContent: "space-around", padding: 18, backgroundColor: "white", marginHorizontal: 15, borderRadius: 20, marginBottom: 15 },
    navButton: { alignItems: "center", padding: 10 },
    navText: { fontSize: 14, color: "#333", fontWeight: "600" },
    header: { backgroundColor: "#3B82F6", padding: 18, paddingTop: 54, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    headerTitle: { color: "white", fontSize: 18, fontWeight: "700" },
    searchBar: { backgroundColor: "white", padding: 12, borderBottomWidth: 1, borderBottomColor: "#eee" },
    searchInput: { backgroundColor: "#f3f4f6", padding: 12, borderRadius: 16, fontSize: 16 },
    chatItem: { flexDirection: "row", alignItems: "center", backgroundColor: "white", padding: 16, borderRadius: 20, marginHorizontal: 15, marginVertical: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
    avatarContainer: { marginRight: 15 },
    avatarPlaceholder: { width: 55, height: 55, borderRadius: 28, justifyContent: "center", alignItems: "center" },
    avatarText: { color: "white", fontSize: 24, fontWeight: "bold" },
    chatInfo: { flex: 1 },
    chatName: { fontSize: 16, fontWeight: "bold", marginBottom: 4 },
    chatPreview: { fontSize: 14, color: "#666" },
    chatRight: { alignItems: "flex-end" },
    chatTime: { fontSize: 11, color: "#999", marginBottom: 4 },
    emptyState: { flex: 1, justifyContent: "center", alignItems: "center", padding: 50 },
    emptyText: { fontSize: 16, color: "#999", marginBottom: 10 },
    chatHeader: { backgroundColor: "#3B82F6", padding: 18, paddingTop: 54, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    chatHeaderInfo: { flexDirection: "row", alignItems: "center", flex: 1, marginLeft: 10 },
    chatAvatarPlaceholder: { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center" },
    chatAvatarText: { color: "white", fontSize: 18, fontWeight: "bold" },
    chatHeaderName: { color: "white", fontSize: 16, fontWeight: "bold", marginLeft: 10 },
    removeIcon: { color: "white", fontSize: 20, fontWeight: "bold", padding: 5 },
    messagesList: { flex: 1 },
    messagesContainer: { padding: 15 },
    messageRow: { marginBottom: 15, alignItems: "flex-end" },
    myMessageRow: { alignItems: "flex-end" },
    theirMessageRow: { alignItems: "flex-start" },
    messageBubble: { maxWidth: "75%", padding: 12, borderRadius: 18 },
    myBubble: { backgroundColor: "#3B82F6", borderBottomRightRadius: 4 },
    theirBubble: { backgroundColor: "#e5e5ea", borderBottomLeftRadius: 4 },
    messageText: { fontSize: 16 },
    myMessageText: { color: "white" },
    theirMessageText: { color: "#000" },
    messageFooter: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", marginTop: 4 },
    messageTime: { fontSize: 10, color: "rgba(0,0,0,0.5)", marginRight: 4 },
    messageStatus: { fontSize: 10, color: "rgba(0,0,0,0.5)" },
    inputContainer: { flexDirection: "row", padding: 15, backgroundColor: "white", borderTopWidth: 1, borderTopColor: "#eee", alignItems: "center" },
    messageInput: { flex: 1, backgroundColor: "#f3f4f6", borderRadius: 24, paddingHorizontal: 18, paddingVertical: 10, fontSize: 16, maxHeight: 100 },
    sendButton: { backgroundColor: "#3B82F6", borderRadius: 24, paddingHorizontal: 22, paddingVertical: 10, marginLeft: 10 },
    sendButtonDisabled: { backgroundColor: "#ccc" },
    sendText: { color: "white", fontWeight: "bold" },
    requestCard: { backgroundColor: "white", margin: 15, padding: 18, borderRadius: 18, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
    requestInfo: { flexDirection: "row", alignItems: "center", marginBottom: 15 },
    requestAvatar: { width: 50, height: 50, borderRadius: 25, justifyContent: "center", alignItems: "center", marginRight: 15 },
    requestDetails: { flex: 1 },
    requestName: { fontSize: 16, fontWeight: "bold", marginBottom: 4 },
    requestText: { fontSize: 14, color: "#666" },
    requestButtons: { flexDirection: "row", justifyContent: "space-between" },
    acceptButton: { flex: 1, backgroundColor: "#10B981", padding: 12, borderRadius: 8, alignItems: "center", marginRight: 8 },
    acceptText: { color: "white", fontWeight: "bold" },
    declineButton: { flex: 1, backgroundColor: "#f0f0f0", padding: 12, borderRadius: 8, alignItems: "center", marginLeft: 8 },
    declineText: { color: "#666", fontWeight: "bold" },
    profileHeader: { backgroundColor: "white", alignItems: "center", padding: 30, marginBottom: 15 },
    profileImagePlaceholder: { width: 100, height: 100, borderRadius: 50, justifyContent: "center", alignItems: "center", marginBottom: 15 },
    profileImageText: { color: "white", fontSize: 48, fontWeight: "bold" },
    profileName: { fontSize: 24, fontWeight: "bold", marginTop: 10 },
    profileUsername: { fontSize: 16, color: "#666", marginTop: 5 },
    profileBio: { fontSize: 14, color: "#666", marginTop: 10, textAlign: "center" },
    editProfileButton: { marginTop: 15, padding: 10, backgroundColor: "#3B82F6", borderRadius: 20 },
    editProfileText: { color: "white", fontWeight: "bold" },
    editButtons: { flexDirection: "row", justifyContent: "center", marginTop: 10 },
    cancelText: { color: "#666", fontSize: 16, marginRight: 20 },
    saveText: { color: "#3B82F6", fontSize: 16, fontWeight: "bold" },
    infoSection: { backgroundColor: "white", margin: 15, marginTop: 0, padding: 20, borderRadius: 18 },
    sectionTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 15, color: "#333" },
    actionButton: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
    actionText: { fontSize: 16, color: "#3B82F6" },
    deleteButton: { borderBottomWidth: 0 },
    deleteText: { fontSize: 16, color: "#ef4444" },
    userCard: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "white", margin: 15, padding: 16, borderRadius: 18, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
    userInfo: { flexDirection: "row", alignItems: "center", flex: 1 },
    userAvatarPlaceholder: { width: 50, height: 50, borderRadius: 25, justifyContent: "center", alignItems: "center", marginRight: 15 },
    userName: { fontSize: 16, fontWeight: "bold" },
    userUsername: { fontSize: 12, color: "#666", marginTop: 2 },
    friendBadge: { color: "#10B981", fontWeight: "bold" },
    pendingBadge: { color: "#F59E0B", fontWeight: "bold" },
    addButton: { backgroundColor: "#3B82F6", paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20 },
    addButtonText: { color: "white", fontWeight: "bold" },
    acceptFriendButton: { backgroundColor: "#10B981", paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20 },
    acceptFriendText: { color: "white", fontWeight: "bold" },
    messageButton: { backgroundColor: "#3B82F6", marginHorizontal: 15, marginBottom: 15, borderRadius: 16, alignItems: "center", padding: 15 },
    messageButtonText: { color: "white", fontSize: 16, fontWeight: "bold" },
    removeFriendButton: { backgroundColor: "#F59E0B", marginHorizontal: 15, marginBottom: 15, borderRadius: 16, alignItems: "center", padding: 15 },
    removeFriendText: { color: "white", fontSize: 16, fontWeight: "bold" },
    addFriendButton: { backgroundColor: "#3B82F6", marginHorizontal: 15, marginBottom: 15, borderRadius: 16, alignItems: "center", padding: 15 },
    addFriendText: { color: "white", fontSize: 16, fontWeight: "bold" },
    errorContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 30 },
    errorTitle: { fontSize: 22, fontWeight: "bold", color: "#ef4444", marginBottom: 15, textAlign: "center" },
    errorText: { fontSize: 16, color: "#333", textAlign: "center", marginBottom: 20, lineHeight: 24 },
    modalFullContainer: { flex: 1, backgroundColor: "white" },
    modalFullHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 15, paddingTop: 50, backgroundColor: "#3B82F6" },
    modalFullClose: { fontSize: 16, color: "white", fontWeight: "bold" },
    modalFullTitle: { fontSize: 18, fontWeight: "bold", color: "white" },
    termsContainer: { padding: 20, backgroundColor: "white" },
    termsTitle: { fontSize: 24, fontWeight: "bold", color: "#3B82F6", marginBottom: 20, textAlign: "center" },
    termsHeading: { fontSize: 18, fontWeight: "bold", marginTop: 15, marginBottom: 10, color: "#333" },
    termsText: { fontSize: 14, color: "#666", marginBottom: 10, lineHeight: 22 },
});