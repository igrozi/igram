import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { client, databases, account, storage, DATABASE_ID,
    COLLECTION_ID_MESSAGES,
    COLLECTION_ID_PROFILES,
    BUCKET_ID_CHAT_IMAGES } from '../appwriteConfig';

import { ID, Query } from 'appwrite';

import { Send, Search, LogOut, Sun, Moon, MoreVertical, Paperclip,
        MessagesSquare, Zap, Settings, X, Loader2, Check, CheckCheck,
        User, Trash2, Reply } from 'lucide-react';

import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion'; motion;

const AnimatedTitle = memo(({ text }) => (
    <div className="flex">
        {Array.from(text).map((char, i) => (
            <motion.span
                key={i}
                animate={{ 
                    opacity: [0.4, 1, 0.4], 
                    textShadow: ["0px 0px 0px rgba(79,70,229,0)", "0px 0px 10px rgba(79,70,229,0.8)", "0px 0px 0px rgba(79,70,229,0)"] 
                }}
                transition={{ duration: 2, repeat: Infinity, delay: i * 0.1 }}
                className="inline-block"
            >
                {char === " " ? "\u00A0" : char}
            </motion.span>
        ))}
    </div>
));

const checkIsOnline = (profile) => {
    if (!profile?.is_online) return false;
    if (!profile?.last_seen) return false;
    const lastSeen = new Date(profile.last_seen).getTime();
    const now = new Date().getTime();
    return (now - lastSeen) < 3 * 60 * 1000; 
};

const formatLastSeen = (dateString) => {
    if (!dateString) return 'Был(а) недавно';
    const date = new Date(dateString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const timeOptions = { hour: '2-digit', minute: '2-digit' };
    const timeString = date.toLocaleTimeString('ru-RU', timeOptions);
    if (isToday) return `Сегодня в ${timeString}`;
    const dateOptions = { day: 'numeric', month: 'short' };
    return `${date.toLocaleDateString('ru-RU', dateOptions)} в ${timeString}`;
};

// eslint-disable-next-line no-unused-vars
const MessageMenu = ({ message, isMe, onDelete, onReply, onClose, position }) => {
    const menuRef = useRef(null);
    
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);
    
    return (
        <motion.div 
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className={`absolute z-50 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border-2 border-gray-200 dark:border-slate-700 overflow-hidden min-w-[150px] ${position}`}
        >
            <button 
                onClick={() => { onReply(); onClose(); }}
                className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors font-bold text-sm"
            >
                <Reply size={16} className="text-indigo-600" />
                <span>Ответить</span>
            </button>
            {isMe && (
                <button 
                    onClick={() => { onDelete(); onClose(); }}
                    className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors font-bold text-sm text-red-600"
                >
                    <Trash2 size={16} />
                    <span>Удалить</span>
                </button>
            )}
        </motion.div>
    );
};

const Room = () => {
    const [user, setUser] = useState(null);
    const [userProfile, setUserProfile] = useState(null);
    const [recentChats, setRecentChats] = useState([]);
    const [selectedContact, setSelectedContact] = useState(null);
    const [messages, setMessages] = useState([]);
    const [messageBody, setMessageBody] = useState('');
    
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);

    const [darkMode, setDarkMode] = useState(localStorage.getItem('theme') === 'dark');
    const [isSending, setIsSending] = useState(false);
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [unreadCounts, setUnreadCounts] = useState({});
    const [activeMenu, setActiveMenu] = useState(null);
    const [menuPosition, setMenuPosition] = useState('right-0 top-0');
    const [replyingTo, setReplyingTo] = useState(null);
    const [deletingMessage, setDeletingMessage] = useState(null);

    const fileInputRef = useRef(null);
    const messagesEndRef = useRef(null);
    const messageRefs = useRef({});
    const navigate = useNavigate();
    const location = useLocation();
    
    
    useEffect(() => {
        if (!userProfile?.$id) return;
        const setOnline = async () => {
            try { await databases.updateDocument(DATABASE_ID, COLLECTION_ID_PROFILES, userProfile.$id, { is_online: true, last_seen: new Date().toISOString() }); } catch (e) { console.error("Ошибка при обновлении статуса онлайн:", e); }
        };
        setOnline();
        const interval = setInterval(setOnline, 60000);
        const setOffline = () => { databases.updateDocument(DATABASE_ID, COLLECTION_ID_PROFILES, userProfile.$id, { is_online: false, last_seen: new Date().toISOString() }).catch(() => {}); };
        window.addEventListener('beforeunload', setOffline);
        return () => { clearInterval(interval); window.removeEventListener('beforeunload', setOffline); }
    }, [userProfile?.$id]);

    const handleLogOut = async () => {
        if (userProfile?.$id) { await databases.updateDocument(DATABASE_ID, COLLECTION_ID_PROFILES, userProfile.$id, { is_online: false, last_seen: new Date().toISOString() }); }
        await account.deleteSession('current');
        navigate('/auth');
    };

    useEffect(() => {
        const searchUsers = async () => {
            if (!searchQuery.trim()) { setSearchResults([]); setIsSearching(false); return; }
            setIsSearching(true);
            try {
                const res = await databases.listDocuments(DATABASE_ID, COLLECTION_ID_PROFILES, [ Query.or([ Query.contains('name', searchQuery), Query.contains('username', searchQuery) ]), Query.limit(15) ]);
                const filtered = res.documents.filter(profile => profile.user_id !== user?.$id);
                setSearchResults(filtered);
            } catch (err) { console.error("Ошибка поиска:", err); } finally { setIsSearching(false); }
        };
        const timer = setTimeout(searchUsers, 400);
        return () => clearTimeout(timer);
    }, [searchQuery, user]);

    const fetchUnreadCounts = useCallback(async (currentUserId) => {
        try {
            const res = await databases.listDocuments(DATABASE_ID, COLLECTION_ID_MESSAGES, [ Query.equal('receiver_id', currentUserId), Query.equal('is_read', false) ]);
            const counts = {};
            res.documents.forEach(msg => { counts[msg.sender_id] = (counts[msg.sender_id] || 0) + 1; });
            setUnreadCounts(counts);
        } catch (err) { console.error(err); }
    }, []);

    const getRecentChats = useCallback(async (currentUserId) => {
        if (!currentUserId) return;
        try {
            const res = await databases.listDocuments(DATABASE_ID, COLLECTION_ID_MESSAGES, [ Query.or([Query.equal('sender_id', currentUserId), Query.equal('receiver_id', currentUserId)]), Query.orderDesc('$createdAt'), Query.limit(100) ]);
            const contactIds = [...new Set(res.documents.flatMap(m => [m.sender_id, m.receiver_id]))].filter(id => id !== currentUserId);
            if (contactIds.length > 0) {
                const profiles = await databases.listDocuments(DATABASE_ID, COLLECTION_ID_PROFILES, [Query.equal('user_id', contactIds)]);
                const sorted = contactIds.map(id => profiles.documents.find(p => p.user_id === id)).filter(Boolean);
                setRecentChats(sorted);
            }
            fetchUnreadCounts(currentUserId);
        } catch (error) { console.error(error); }
    }, [fetchUnreadCounts]);

    const markMessagesAsRead = useCallback(async (senderId) => {
        if (!user || !senderId) return;
        try {
            const res = await databases.listDocuments(DATABASE_ID, COLLECTION_ID_MESSAGES, [ Query.equal('receiver_id', user.$id), Query.equal('sender_id', senderId), Query.equal('is_read', false) ]);
            await Promise.all(res.documents.map(msg => databases.updateDocument(DATABASE_ID, COLLECTION_ID_MESSAGES, msg.$id, { is_read: true })));
            setUnreadCounts(prev => ({ ...prev, [senderId]: 0 }));
        } catch (err) { console.error(err); }
    }, [user]);

    const handleDeleteMessage = async (messageId) => {
        if (!messageId || !user) return;
        
        setDeletingMessage(messageId);

        setTimeout(async () => {
            try {
                await databases.deleteDocument(DATABASE_ID, COLLECTION_ID_MESSAGES, messageId);
                setDeletingMessage(null);
                setActiveMenu(null);
            } catch (error) {
                console.error("Ошибка при удалении сообщения:", error);
                setDeletingMessage(null);
            }
        }, 400);
    };

    const handleContextMenu = (e, msg) => {
        e.preventDefault();
        // eslint-disable-next-line no-unused-vars
        const rect = e.currentTarget.getBoundingClientRect();
        const isMe = msg.sender_id === user?.$id;
        
        const position = isMe ? 'right-0 top-0' : 'left-0 top-0';
        setMenuPosition(position);
        setActiveMenu(msg.$id);
    };

    useEffect(() => {
        const init = async () => {
            try {
                const curr = await account.get();
                setUser(curr);
                const profile = await databases.listDocuments(DATABASE_ID, COLLECTION_ID_PROFILES, [Query.equal('user_id', curr.$id)]);
                const profData = profile.documents[0];
                setUserProfile(profData);
                localStorage.setItem('current_profile_id', profData.$id);
                getRecentChats(curr.$id);
                if (location.state?.openContact) { setSelectedContact(location.state.openContact); }
            } catch { navigate('/auth'); }
        };
        init();
    }, [navigate, getRecentChats, location.state]);

    useEffect(() => {
        if (!user) return;
        const unsub = client.subscribe([ `databases.${DATABASE_ID}.collections.${COLLECTION_ID_MESSAGES}.documents`, `databases.${DATABASE_ID}.collections.${COLLECTION_ID_PROFILES}.documents` ], res => {
            const payload = res.payload;
            if (res.events.some(e => e.includes('.create'))) {
                if (payload.sender_id === user.$id || payload.receiver_id === user.$id) {
                    getRecentChats(user.$id); 
                    if (payload.sender_id === selectedContact?.user_id || payload.receiver_id === selectedContact?.user_id) {
                        setMessages(prev => [...prev, payload]);
                        if (payload.receiver_id === user.$id) markMessagesAsRead(selectedContact.user_id);
                    }
                }
            }
            if (res.events.some(e => e.includes('.update'))) {
                setMessages(prev => prev.map(m => m.$id === payload.$id ? payload : m));
                if (payload.user_id) {
                    setRecentChats(prev => prev.map(p => p.$id === payload.$id ? payload : p));
                    if (selectedContact?.$id === payload.$id) setSelectedContact(payload);
                }
            }
            if (res.events.some(e => e.includes('.delete'))) {
                setMessages(prev => prev.filter(m => m.$id !== payload.$id));
            }
        });
        return () => unsub();
    }, [user, selectedContact, getRecentChats, markMessagesAsRead]);

    useEffect(() => {
        if (selectedContact && user) {
            const getMessages = async () => {
                const res = await databases.listDocuments(DATABASE_ID, COLLECTION_ID_MESSAGES, [Query.orderAsc('$createdAt'), Query.limit(100)]);
                const filtered = res.documents.filter(msg => (msg.sender_id === user.$id && msg.receiver_id === selectedContact.user_id) || (msg.sender_id === selectedContact.user_id && msg.receiver_id === user.$id));
                setMessages(filtered);
                markMessagesAsRead(selectedContact.user_id);
            };
            getMessages();
        }
    }, [selectedContact, user, markMessagesAsRead]);

    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
    useEffect(() => { const root = document.documentElement; darkMode ? root.classList.add('dark') : root.classList.remove('dark'); localStorage.setItem('theme', darkMode ? 'dark' : 'light'); }, [darkMode]);

    const sendMessage = async (e) => {
        e.preventDefault();
        if ((!messageBody.trim() && !imageFile) || !selectedContact || isSending) return;
        setIsSending(true);
        try {
            let imageUrl = null;
            if (imageFile) {
                const uploaded = await storage.createFile(BUCKET_ID_CHAT_IMAGES, ID.unique(), imageFile);
                const fileUrl = storage.getFileView(BUCKET_ID_CHAT_IMAGES, uploaded.$id);
                imageUrl = fileUrl.href || fileUrl.toString();
            }
            
            const messageData = {
                body: messageBody, 
                image_url: imageUrl, 
                sender_id: user.$id, 
                sender_name: userProfile?.name || user.name, 
                receiver_id: selectedContact.user_id, 
                is_read: false
            };
            
            if (replyingTo) {
                messageData.reply_to = replyingTo.$id;
                messageData.reply_to_body = replyingTo.body?.substring(0, 50) + (replyingTo.body?.length > 50 ? '...' : '');
                messageData.reply_to_sender = replyingTo.sender_name;
            }
            
            await databases.createDocument(DATABASE_ID, COLLECTION_ID_MESSAGES, ID.unique(), messageData);
            
            setMessageBody(''); 
            setImageFile(null); 
            setImagePreview(null);
            setReplyingTo(null);
        } catch (error) { console.error(error); } finally { setIsSending(false); }
    };

    const listToShow = searchQuery ? searchResults : recentChats;
    if (!user) return null;

    return (
        <div className={`flex h-screen overflow-hidden ${darkMode ? 'dark bg-[#020617]' : 'bg-gray-200'}`}>
            <div className="fixed inset-0 pointer-events-none z-0">
                <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 10, repeat: Infinity }} className="absolute -top-20 -left-20 w-96 h-96 bg-indigo-600/20 rounded-full blur-[100px]" />
                <motion.div className="absolute -bottom-20 -right-20 w-[30rem] h-[30rem] bg-purple-600/10 rounded-full blur-[120px]" />
            </div>

            <div className="w-96 bg-white dark:bg-slate-900 border-r-4 border-gray-300 dark:border-slate-800 flex flex-col z-20 shrink-0">
                <div className="p-8 border-b-4 border-gray-300 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-3">
                            <div className="bg-indigo-600 p-2.5 rounded-2xl shadow-[0_0_20px_rgba(79,70,229,0.5)]"><Zap size={24} className="text-white fill-current" /></div>
                            <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tighter">
                                <AnimatedTitle text="IGROGRAM" />
                            </h1>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => navigate(`/profile/${userProfile?.username}`)} className="p-2.5 bg-indigo-600 dark:bg-indigo-700 rounded-xl text-white border-2 border-indigo-600 shadow-[0_0_20px_rgba(79,70,229,0.5)] hover:scale-105 transition-all">
                                <User size={22} strokeWidth={3}/>
                            </button>
                            <motion.button whileHover={{ scale: 1.08, backgroundColor: 'rgba(239, 68, 68, 0.2)', boxShadow: "0px 0px 25px rgba(239, 68, 68, 0.3)", rotate: [0, -1, 1, -1, 1, 0] }} whileTap={{ scale: 0.92 }} onClick={handleLogOut} className="p-2.5 bg-red-50 dark:bg-red-900/20 rounded-xl text-red-500 hover:bg-red-500 hover:text-white transition-all border-2 border-transparent">
                                <LogOut size={22}/>
                            </motion.button>
                        </div>
                    </div>
                    <div className="relative group">
                        {isSearching ? <Loader2 className="absolute left-4 top-4 text-indigo-600 animate-spin" size={20} /> : <Search className="absolute left-4 top-4 text-gray-400 group-focus-within:text-indigo-600 transition-colors" size={20} />}
                        <input type="text" placeholder="Введите тег пользователя..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-12 pr-4 py-4 bg-gray-100 dark:bg-slate-800 dark:text-white rounded-2xl border-4 border-gray-200 dark:border-slate-700 outline-none focus:border-indigo-600 text-sm font-black shadow-inner transition-all" />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-6 space-y-3 custom-scrollbar">
                    {searchQuery && <p className="text-[10px] font-black uppercase text-gray-400 px-4 mb-2">Global Search Results</p>}
                    
                    {listToShow.map(contact => {
                        const isUserOnline = checkIsOnline(contact);
                        return (
                        <motion.div key={contact.$id} whileHover={{ x: 5 }} onClick={() => { setSelectedContact(contact); if(searchQuery) setSearchQuery(''); setReplyingTo(null); }} className={`flex items-center gap-4 px-5 py-5 cursor-pointer rounded-[2rem] border-4 transition-all relative ${selectedContact?.user_id === contact.user_id ? 'bg-indigo-600 border-indigo-400 text-white shadow-[0_10px_20px_rgba(79,70,229,0.3)]' : 'bg-white dark:bg-slate-800/40 border-gray-200 dark:border-slate-800 hover:border-indigo-600/50'}`}>
                            <div className="relative">
                                <img 
                                    src={contact.avatar_url || `https://ui-avatars.com/api/?name=${contact.name}&background=4f46e5&color=fff&size=128`} 
                                    className="w-14 h-14 rounded-2xl object-cover border-2 border-white/20 shadow-lg" 
                                    alt="" 
                                    onError={(e) => {
                                        e.target.onerror = null;
                                        e.target.src = `https://ui-avatars.com/api/?name=${contact.name}&background=4f46e5&color=fff&size=128`;
                                    }}
                                />
                                {isUserOnline && <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-4 border-white dark:border-slate-900 bg-green-500 shadow-md animate-pulse"></div>}
                            </div>
                            <div className="flex-1 overflow-hidden">
                                <h3 className="font-black truncate text-lg tracking-tight">{contact.name}</h3>
                                {contact.typing_to === user?.$id ? (
                                    <p className="text-[10px] font-black uppercase text-indigo-200 animate-pulse">Typing...</p>
                                ) : (
                                    <p className={`text-[10px] font-black uppercase mt-1 ${selectedContact?.user_id === contact.user_id ? 'text-indigo-200' : 'text-indigo-500'}`}>@{contact.username}</p>
                                )}
                            </div>
                            {unreadCounts[contact.user_id] > 0 && selectedContact?.user_id !== contact.user_id && (
                                <div className="bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full border-2 border-white animate-bounce shadow-md">{unreadCounts[contact.user_id]}</div>
                            )}
                        </motion.div>
                    )})}
                    {searchQuery && listToShow.length === 0 && !isSearching && <div className="p-8 text-center text-gray-500 font-bold uppercase text-xs">No users found</div>}
                </div>

                <div className="p-6 flex gap-3">
                    <button onClick={() => navigate('/settings')} className="p-4 rounded-2xl border-4 border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white hover:border-indigo-600 transition-all shadow-md shrink-0"><Settings size={22}/></button>
                    <button onClick={() => setDarkMode(!darkMode)} className="flex-1 flex items-center justify-center gap-3 py-4 rounded-2xl border-4 border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white hover:border-indigo-600 transition-all font-black text-xs uppercase tracking-widest shadow-md">
                        {darkMode ? <Sun size={20} className="text-yellow-500"/> : <Moon size={20} className="text-indigo-600"/>}
                        {darkMode ? 'СВЕТЛАЯ ТЕМА' : 'ТЁМНАЯ ТЕМА'}
                    </button>
                </div>
            </div>

            <div className="flex-1 flex flex-col relative z-10 min-w-0">
                {selectedContact ? (
                    <>
                        <div className="h-28 flex items-center justify-between px-12 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b-4 border-gray-300 dark:border-slate-800 shadow-sm shrink-0">
                            <div className="flex items-center gap-6 cursor-pointer" onClick={() => navigate(`/profile/${selectedContact.username}`)}>
                                <img 
                                    src={selectedContact.avatar_url || `https://ui-avatars.com/api/?name=${selectedContact.name}&background=4f46e5&color=fff&size=128`} 
                                    className="w-16 h-16 rounded-[1.5rem] object-cover border-4 border-indigo-600 shadow-2xl" 
                                    alt="" 
                                    onError={(e) => {
                                        e.target.onerror = null;
                                        e.target.src = `https://ui-avatars.com/api/?name=${selectedContact.name}&background=4f46e5&color=fff&size=128`;
                                    }}
                                />
                                <div>
                                    <h2 className="font-black text-gray-900 dark:text-white text-2xl tracking-tighter">{selectedContact.name}</h2>
                                    <div className="flex items-center gap-2">
                                        <span className={`w-2 h-2 rounded-full ${checkIsOnline(selectedContact) ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : 'bg-gray-400'}`}></span>
                                        <span className={`text-[11px] font-black uppercase tracking-[0.2em] ${checkIsOnline(selectedContact) ? 'text-green-500' : 'text-gray-500 dark:text-gray-400'}`}>{checkIsOnline(selectedContact) ? 'ONLINE' : formatLastSeen(selectedContact.last_seen)}</span>
                                    </div>
                                </div>
                            </div>
                            <button className="p-3 bg-gray-100 dark:bg-slate-800 rounded-2xl text-gray-400 hover:text-indigo-600 border-2 border-transparent hover:border-indigo-600 transition-all shadow-md"><MoreVertical size={24}/></button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 md:p-12 space-y-4 custom-scrollbar flex flex-col">
                            <AnimatePresence>
                                {messages.map((msg) => {
                                    const isMe = msg.sender_id === user?.$id;
                                    const isDeleting = deletingMessage === msg.$id;

                                    const messageAnimation = isDeleting ? {
                                        scale: [1, 1.2, 0.8, 1.5, 0],
                                        rotate: [0, 5, -5, 10, 0],
                                        opacity: [1, 0.8, 0.6, 0.3, 0],
                                        transition: { duration: 0.4 }
                                    } : {
                                        opacity: 1,
                                        scale: 1,
                                        rotate: 0
                                    };
                                    
                                    return (
                                        <motion.div 
                                            key={msg.$id}
                                            ref={el => messageRefs.current[msg.$id] = el}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={messageAnimation}
                                            exit={{ opacity: 0, scale: 0, rotate: 20 }}
                                            transition={{ duration: 0.3 }}
                                            className={`flex w-full ${isMe ? 'justify-end' : 'justify-start'} relative group`}
                                            onContextMenu={(e) => handleContextMenu(e, msg)}
                                        >
                                            <div className={`relative max-w-[80%] md:max-w-[65%] shadow-xl border-4 transition-all ${isMe ? 'bg-indigo-600 border-none text-white rounded-[1.5rem] rounded-tr-none ml-12' : 'bg-white border-gray-300 text-gray-900 dark:bg-slate-800 dark:border-slate-700 dark:text-gray-100 rounded-[1.5rem] rounded-tl-none mr-12'}`}>
                                                
                                                {msg.reply_to && (
                                                    <div className={`px-5 pt-3 pb-1 text-xs border-b ${isMe ? 'border-indigo-500' : 'border-gray-200 dark:border-slate-700'}`}>
                                                        <div className="flex items-center gap-1 mb-1">
                                                            <Reply size={12} className={isMe ? 'text-indigo-200' : 'text-gray-500'} />
                                                            <span className={`font-bold ${isMe ? 'text-indigo-200' : 'text-gray-600 dark:text-gray-400'}`}>
                                                                Ответ {msg.reply_to_sender === user?.name ? 'себе' : msg.reply_to_sender}:
                                                            </span>
                                                        </div>
                                                        <p className={`italic truncate ${isMe ? 'text-indigo-100' : 'text-gray-500 dark:text-gray-400'}`}>
                                                            {msg.reply_to_body || 'Сообщение удалено'}
                                                        </p>
                                                    </div>
                                                )}
                                                
                                                {msg.image_url && (
                                                    <div className="p-1.5">
                                                        <img 
                                                            src={msg.image_url} 
                                                            className="w-full h-auto rounded-[1rem] object-cover max-h-96 shadow-md" 
                                                            alt="" 
                                                            onError={(e) => {
                                                                e.target.onerror = null;
                                                                e.target.style.display = 'none';
                                                            }}
                                                        />
                                                    </div>
                                                )}
                                                <div className="px-5 py-3 pb-6 relative min-w-[120px]">
                                                    {msg.body && <p className="text-base font-bold leading-relaxed tracking-tight whitespace-pre-wrap">{msg.body}</p>}
                                                    <div className="absolute bottom-1.5 right-3 flex items-center gap-1 opacity-70">
                                                        <span className="text-[10px] font-black uppercase tracking-tighter">{new Date(msg.$createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                                        {isMe && (msg.is_read ? <CheckCheck size={14} className="text-white" /> : <Check size={14} className="text-white/60" />)}
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    // eslint-disable-next-line no-unused-vars
                                                    const rect = e.currentTarget.parentElement?.getBoundingClientRect();
                                                    const position = isMe ? 'right-0 top-0' : 'left-0 top-0';
                                                    setMenuPosition(position);
                                                    setActiveMenu(activeMenu === msg.$id ? null : msg.$id);
                                                }}
                                                className={`absolute top-2 ${isMe ? 'left-2' : 'right-2'} opacity-0 group-hover:opacity-100 transition-opacity p-1.5 bg-gray-200 dark:bg-slate-700 rounded-full shadow-md z-10`}
                                            >
                                                <MoreVertical size={14} className="text-gray-600 dark:text-gray-300" />
                                            </button>
                                            
                                            <AnimatePresence>
                                                {activeMenu === msg.$id && (
                                                    <MessageMenu 
                                                        message={msg}
                                                        isMe={isMe}
                                                        onDelete={() => handleDeleteMessage(msg.$id)}
                                                        onReply={() => setReplyingTo(msg)}
                                                        onClose={() => setActiveMenu(null)}
                                                        position={menuPosition}
                                                    />
                                                )}
                                            </AnimatePresence>
                                        </motion.div>
                                    );
                                })}
                            </AnimatePresence>
                            
                            <AnimatePresence>
                                {replyingTo && (
                                    <motion.div 
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 10 }}
                                        className="sticky bottom-0 left-0 right-0 mb-2 p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl border border-indigo-200 dark:border-indigo-800 flex items-center justify-between"
                                    >
                                        <div className="flex items-center gap-2">
                                            <Reply size={16} className="text-indigo-600" />
                                            <div>
                                                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                                                    Ответ {replyingTo.sender_name === user?.name ? 'себе' : replyingTo.sender_name}
                                                </span>
                                                <p className="text-xs text-gray-600 dark:text-gray-300 truncate max-w-xs">
                                                    {replyingTo.body || 'Изображение'}
                                                </p>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => setReplyingTo(null)}
                                            className="p-1 hover:bg-indigo-200 dark:hover:bg-indigo-800 rounded-full transition-colors"
                                        >
                                            <X size={16} className="text-indigo-600" />
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                            
                            <div ref={messagesEndRef} />
                        </div>

                        <div className="p-8 bg-white dark:bg-slate-900 border-t-4 border-gray-300 dark:border-slate-800 shrink-0 shadow-2xl">
                            {imagePreview && (
                                <div className="mb-4 relative inline-block">
                                    <div className="bg-white dark:bg-slate-800 p-2 rounded-2xl border-4 border-indigo-600 shadow-2xl">
                                        <img src={imagePreview} className="h-28 w-auto rounded-xl object-cover" alt="" />
                                        <button onClick={() => {setImageFile(null); setImagePreview(null)}} className="absolute -top-3 -right-3 bg-red-500 text-white p-1.5 rounded-full border-2 border-white shadow-md hover:bg-red-600 transition-colors"><X size={16}/></button>
                                    </div>
                                </div>
                            )}
                            <form onSubmit={sendMessage} className="max-w-6xl mx-auto flex items-end gap-6 relative">
                                <div className="flex-1 bg-gray-100 dark:bg-slate-800 px-8 py-5 rounded-[2.5rem] border-4 border-gray-200 dark:border-slate-700 flex items-center gap-4 focus-within:border-indigo-600 transition-all shadow-inner">
                                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => {
                                        const file = e.target.files[0];
                                        if (file) { setImageFile(file); setImagePreview(URL.createObjectURL(file)); }
                                    }} />
                                    <button type="button" onClick={() => fileInputRef.current.click()} className="text-gray-400 hover:text-indigo-600 transition-colors"><Paperclip size={24} /></button>
                                    <input 
                                        type="text" 
                                        placeholder={replyingTo ? "Напишите ответ..." : "Write a message..."} 
                                        className="flex-1 bg-transparent dark:text-white text-gray-900 outline-none text-lg font-bold" 
                                        value={messageBody} 
                                        onChange={(e) => setMessageBody(e.target.value)} 
                                    />
                                </div>
                                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} type="submit" disabled={isSending || (!messageBody.trim() && !imageFile)} className="p-5 rounded-[2rem] bg-indigo-600 border-4 border-indigo-500 text-white shadow-[0_10px_20px_rgba(79,70,229,0.4)]">
                                    {isSending ? <Loader2 size={28} className="animate-spin" /> : <Send size={28} />}
                                </motion.button>
                            </form>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                        <motion.div animate={{ rotate: [0, 5, 0, -5, 0], scale: [1, 1.05, 1] }} transition={{ duration: 6, repeat: Infinity }} className="w-64 h-64 bg-white dark:bg-slate-800 rounded-[80px] flex items-center justify-center mb-10 shadow-[20px_20px_60px_rgba(0,0,0,0.1)] border-8 border-gray-200 dark:border-slate-700">
                            <MessagesSquare size={120} className="text-indigo-600 opacity-20"/>
                        </motion.div>
                        <h2 className="text-5xl font-black text-gray-900 dark:text-white uppercase tracking-tighter mb-4">ВЫБЕРИТЕ ЧАТ</h2>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Room;