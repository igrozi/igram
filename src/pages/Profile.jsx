/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { databases, account, client, storage, DATABASE_ID, COLLECTION_ID_PROFILES, COLLECTION_ID_POSTS, COLLECTION_ID_COMMENTS, COLLECTION_ID_RATINGS, BUCKET_ID_POSTS } from '../appwriteConfig';
import { Query, ID } from 'appwrite';
import { motion, AnimatePresence } from 'framer-motion'; 
import { ChevronLeft, MessageCircle, Star, Zap, Heart, MessageSquare, Send, Pencil, Check, X, Calendar, Trash2, Image as ImageIcon, Loader2, Reply } from 'lucide-react';

const superSlowFloat = {
    y: [0, -5, 0, 5, 0],
    transition: { duration: 5, repeat: Infinity, ease: "easeInOut" }
};

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

const formatDateWithTime = (dateString) => {
    return new Date(dateString).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const AnimatedTitle = memo(({ text }) => (
    <div className="flex justify-center">
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

const Profile = () => {
    const { username } = useParams();
    const navigate = useNavigate();
    const fileInputRef = useRef(null);
    const [profile, setProfile] = useState(null);
    const [posts, setPosts] = useState([]);
    const [currentUser, setCurrentUser] = useState(null);
    const [currentUserProfile, setCurrentUserProfile] = useState(null);
    const [myVote, setMyVote] = useState(0);
    const [hasVoted, setHasVoted] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [hoverRating, setHoverRating] = useState(0);
    const [editingBio, setEditingBio] = useState(false);
    const [newBio, setNewBio] = useState("");
    const [showComments, setShowComments] = useState({});
    const [commentTexts, setCommentTexts] = useState({});
    const [postText, setPostText] = useState("");
    const [postImage, setPostImage] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [isPosting, setIsPosting] = useState(false);
    const [ratingStats, setRatingStats] = useState({1: 0, 2: 0, 3: 0, 4: 0, 5: 0});
    const [replyingTo, setReplyingTo] = useState(null);

    const [darkMode, setDarkMode] = useState(localStorage.getItem('theme') === 'dark');

    const isOwnProfile = useMemo(() => {return currentUser && profile && currentUser.$id === profile.user_id;}, [currentUser, profile]);
    
    const fetchProfileData = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const user = await account.get().catch(() => { navigate('/auth'); return null; });
            if (!user) return;
            
            setCurrentUser(user);
            const currentUserProfileRes = await databases.listDocuments(DATABASE_ID, COLLECTION_ID_PROFILES, [Query.equal('user_id', user.$id)]);
            if (currentUserProfileRes.documents.length > 0) setCurrentUserProfile(currentUserProfileRes.documents[0]);
            
            const profRes = await databases.listDocuments(DATABASE_ID, COLLECTION_ID_PROFILES, [Query.equal('username', username.toLowerCase())]);
            if (profRes.documents.length === 0) { setError("Профиль не найден"); setLoading(false); return; }
            
            const profDoc = profRes.documents[0];
            setProfile(profDoc);
            setNewBio(profDoc.bio || "");
            if (user && profDoc.user_id !== user.$id && profDoc.voted_users) {
                if (profDoc.voted_users.includes(user.$id)) {
                    setHasVoted(true);
                    setMyVote(profDoc.rating || 0);
                }
            }

            if (user?.$id === profDoc.user_id) {
                try {
                    const ratingsRes = await databases.listDocuments(DATABASE_ID, COLLECTION_ID_RATINGS, [Query.equal('rated_user_id', profDoc.user_id)]);
                    const stats = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0};
                    ratingsRes.documents.forEach(r => {
                        if (r.score && stats[r.score] !== undefined) {
                            stats[r.score]++;
                        }
                    });
                    setRatingStats(stats);
                } catch (err) {
                    console.error("Ошибка загрузки детальной статистики оценок:", err);
                }
            }

            const postsRes = await databases.listDocuments(DATABASE_ID, COLLECTION_ID_POSTS, [Query.equal('author_id', profDoc.user_id), Query.orderDesc('$createdAt'), Query.limit(20)]);
            const postsWithComments = await Promise.all(
                postsRes.documents.map(async (post) => {
                    try {
                        const commentsRes = await databases.listDocuments(DATABASE_ID, COLLECTION_ID_COMMENTS, [ Query.equal('post_id', post.$id), Query.orderAsc('$createdAt'), Query.limit(50) ]);
                        return { ...post, comments: commentsRes.documents };
                    } catch (err) { 
                        console.error(err);
                        return { ...post, comments: [] }; 
                    }
                })
            );
            setPosts(postsWithComments);
        } catch (err) { 
            console.error(err);
            setError("Не удалось загрузить данные профиля."); 
        } finally { setLoading(false); }
    }, [username, navigate]);

    useEffect(() => {
        fetchProfileData();
        const setupRealtimeSubscription = () => {
            if (!client || typeof client.subscribe !== 'function') return () => {};
            try {
                const unsubscribe = client.subscribe([
                    `databases.${DATABASE_ID}.collections.${COLLECTION_ID_PROFILES}.documents`,
                    `databases.${DATABASE_ID}.collections.${COLLECTION_ID_POSTS}.documents`,
                    `databases.${DATABASE_ID}.collections.${COLLECTION_ID_COMMENTS}.documents`
                ], (response) => {
                    const { events, payload } = response;
                    
                    if (events.some(e => e.includes(`collections.${COLLECTION_ID_PROFILES}`))) {
                        if (payload.username === username?.toLowerCase()) {
                            setProfile(payload);
                            setNewBio(payload.bio || "");
                        }
                    }
                    
                    if (events.some(e => e.includes(`collections.${COLLECTION_ID_POSTS}`))) {
                        if (events.some(e => e.includes('.create'))) {
                            setPosts(prev => {
                                if (payload.author_id === profile?.user_id && !prev.find(p => p.$id === payload.$id)) {
                                    return [{...payload, comments: []}, ...prev];
                                }
                                return prev;
                            });
                        } else if (events.some(e => e.includes('.delete'))) {
                            setPosts(prev => prev.filter(p => p.$id !== payload.$id));
                        } else if (events.some(e => e.includes('.update'))) {
                            setPosts(prev => prev.map(p => p.$id === payload.$id ? { ...p, ...payload, comments: p.comments } : p));
                        }
                    }

                    if (events.some(e => e.includes(`collections.${COLLECTION_ID_COMMENTS}`))) {
                        if (events.some(e => e.includes('.create'))) {
                            setPosts(prev => prev.map(post => {
                                if (post.$id === payload.post_id) {
                                    if (post.comments?.find(c => c.$id === payload.$id)) return post;
                                    return { ...post, comments: [...(post.comments || []), payload] };
                                }
                                return post;
                            }));
                        } else if (events.some(e => e.includes('.delete'))) {
                            setPosts(prev => prev.map(post => {
                                if (post.$id === payload.post_id) {
                                    return { ...post, comments: post.comments?.filter(c => c.$id !== payload.$id) || [] };
                                }
                                return post;
                            }));
                        }
                    }
                });
                return () => { if (unsubscribe && typeof unsubscribe === 'function') unsubscribe(); };
            } catch (error) { 
                console.error(error);
                return () => {}; 
            }
        };
        const unsubscribe = setupRealtimeSubscription();
        return unsubscribe;
    }, [fetchProfileData, username, profile?.user_id]);

    useEffect(() => {
        if (!currentUserProfile?.$id) return;
        const setOnline = async () => {
            try { await databases.updateDocument(DATABASE_ID, COLLECTION_ID_PROFILES, currentUserProfile.$id, { is_online: true, last_seen: new Date().toISOString() }); } catch (e) {console.error("Ошибка при обновлении статуса онлайн:", e);}
        };
        setOnline();
        const interval = setInterval(setOnline, 60000);
        const setOffline = () => { databases.updateDocument(DATABASE_ID, COLLECTION_ID_PROFILES, currentUserProfile.$id, { is_online: false, last_seen: new Date().toISOString() }).catch((e) => {console.error(e)}); };
        window.addEventListener('beforeunload', setOffline);
        return () => { clearInterval(interval); window.removeEventListener('beforeunload', setOffline); }
    }, [currentUserProfile?.$id]);

    const goToChat = () => {
        if (!profile || !currentUser) { navigate('/auth'); return; }
        navigate('/', { state: { openContact: profile } });
    };

    const handleRate = async (score) => {
        if (isOwnProfile || !currentUser || !profile || hasVoted) return;
        try {
            const currentRating = profile.rating || 0;
            const currentCount = profile.rating_count || 0;
            const currentVotedUsers = profile.voted_users || [];
            if (currentVotedUsers.includes(currentUser.$id)) { alert("Ваша оценка уже зафиксирована."); setHasVoted(true); return; }
            const newCount = currentCount + 1;
            const newAvg = ((currentRating * currentCount) + score) / newCount;
            const updatedVotedUsers = [...currentVotedUsers, currentUser.$id];
            
            await databases.updateDocument(DATABASE_ID, COLLECTION_ID_PROFILES, profile.$id, { rating: parseFloat(newAvg.toFixed(1)), rating_count: newCount, voted_users: updatedVotedUsers });
            try { await databases.createDocument(DATABASE_ID, COLLECTION_ID_RATINGS, ID.unique(), { rater_id: currentUser.$id, rated_user_id: profile.user_id, score: score }); } catch (err) { console.error("Ошибка при сохранении оценки:", err); }
            
            setMyVote(score);
            setHasVoted(true);
            setProfile(prev => ({ ...prev, rating: parseFloat(newAvg.toFixed(1)), rating_count: newCount, voted_users: updatedVotedUsers }));
        } catch (e) { 
            console.error(e);
            alert("Не удалось сохранить оценку."); 
        }
    };

    const handleUpdateBio = async () => {
        if (!isOwnProfile || !profile) return;
        try {
            await databases.updateDocument(DATABASE_ID, COLLECTION_ID_PROFILES, profile.$id, { bio: newBio });
            setEditingBio(false);
        } catch (error) { 
            alert("Ошибка сохранения биографии.");  
            console.error("Ошибка при обновлении биографии:", error); 
        }
    };

    const handleImageSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 10 * 1024 * 1024) { alert("Размер превышает 10 МБ."); return; }
            setPostImage(file);
            setImagePreview(URL.createObjectURL(file));
        }
    };

    const clearImageSelection = () => {
        setPostImage(null); setImagePreview(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const createPost = async () => {
        if ((!postText.trim() && !postImage) || !currentUser || !profile) return;
        setIsPosting(true);
        try {
            let uploadedImageUrl = null;
            if (postImage) {
                try {
                    const uploadedFile = await storage.createFile(BUCKET_ID_POSTS, ID.unique(), postImage);
                    const fileUrl = storage.getFileView(BUCKET_ID_POSTS, uploadedFile.$id);
                    uploadedImageUrl = fileUrl.href || fileUrl.toString();
                } catch (uploadError) { 
                    setIsPosting(false); 
                    console.error("Ошибка при загрузке изображения:", uploadError); 
                    return; 
                }
            }
            
            const newPost = await databases.createDocument(DATABASE_ID, COLLECTION_ID_POSTS, ID.unique(), { 
                author_id: profile.user_id, 
                author_name: profile.name, 
                author_username: profile.username, 
                author_avatar: profile.avatar_url, 
                content: postText, 
                image_url: uploadedImageUrl, 
                likes: [], 
                comments_count: 0, 
                created_at: new Date().toISOString() 
            });
            
            setPosts(prev => {
                if (!prev.find(p => p.$id === newPost.$id)) return [{ ...newPost, comments: [] }, ...prev];
                return prev;
            });
            setPostText(""); clearImageSelection();
        } catch (error) { 
            alert("Не удалось опубликовать запись."); 
            console.error("Ошибка при создании поста:", error); 
        } finally { setIsPosting(false); }
    };

    const handleDeletePost = async (postId) => {
        if (!currentUser || !profile) return;
        if (!window.confirm("Удалить пост? Действие необратимо.")) return;
        try {
            const postToDelete = posts.find(p => p.$id === postId);
            if (!postToDelete || postToDelete.author_id !== currentUser.$id) return;
            await databases.deleteDocument(DATABASE_ID, COLLECTION_ID_POSTS, postId);
            if (postToDelete.comments && postToDelete.comments.length > 0) {
                for (const comment of postToDelete.comments) {
                    try { await databases.deleteDocument(DATABASE_ID, COLLECTION_ID_COMMENTS, comment.$id); } catch (err) { console.error("Ошибка при удалении комментария:", err); }
                }
            }
        } catch (error) { alert("Сбой при удалении."); console.error("Ошибка при удалении поста:", error); }
    };

    const handleLikePost = async (postId, currentLikes = [], e) => {
        if (e) e.preventDefault();
        if (!currentUser) return;
        const userId = currentUser.$id;
        const hasLiked = currentLikes.includes(userId);
        try {
            const updatedLikes = hasLiked ? currentLikes.filter(id => id !== userId) : [...currentLikes, userId];
            setPosts(posts.map(post => post.$id === postId ? { ...post, likes: updatedLikes } : post));
            await databases.updateDocument(DATABASE_ID, COLLECTION_ID_POSTS, postId, { likes: updatedLikes });
        } catch (error) { console.error("Ошибка при обновлении лайков:", error); }
    };

    const handleAddComment = async (postId, commentText, replyToComment = null) => {
        if (!currentUser || !commentText.trim() || !currentUserProfile) return;
        try {
            const commentData = {
                post_id: postId,
                author_id: currentUser.$id,
                author_name: currentUserProfile.name,
                author_avatar: currentUserProfile.avatar_url,
                content: commentText,
                created_at: new Date().toISOString()
            };

            if (replyToComment) {
                commentData.reply_to = replyToComment.$id;
                commentData.reply_to_author = replyToComment.author_name;
            }
            
            const newComment = await databases.createDocument(DATABASE_ID, COLLECTION_ID_COMMENTS, ID.unique(), commentData);
            
            const postToUpdate = posts.find(p => p.$id === postId);
            if (postToUpdate) {
                const newCommentsCount = (postToUpdate.comments_count || 0) + 1;
                await databases.updateDocument(DATABASE_ID, COLLECTION_ID_POSTS, postId, { comments_count: newCommentsCount });
            }
            
            setCommentTexts({...commentTexts, [postId]: ''});
        } catch (e) { 
            console.error("Ошибка при добавлении комментария:", e);
            alert("Не удалось отправить комментарий."); 
        }
    };

    const handleDeleteComment = async (postId, commentId) => {
        if (!currentUser) return;
        if (!window.confirm("Удалить этот комментарий?")) return;
        try {
            const post = posts.find(p => p.$id === postId);
            const comment = post?.comments?.find(c => c.$id === commentId);
            if (!comment) return;
            const isCommentAuthor = comment.author_id === currentUser.$id;
            const isWallOwner = profile.user_id === currentUser.$id;
            if (!isCommentAuthor && !isWallOwner) return;
            
            await databases.deleteDocument(DATABASE_ID, COLLECTION_ID_COMMENTS, commentId);
            
            const updatedCount = Math.max((post.comments_count || 0) - 1, 0);
            await databases.updateDocument(DATABASE_ID, COLLECTION_ID_POSTS, postId, { comments_count: updatedCount });
        }
        catch (error) { console.error(error); }
    };

    const RatingStars = ({ vote, onRate, disabled }) => {
        return (
            <div className="flex justify-center gap-1">
                {[1, 2, 3, 4, 5].map(star => (
                    <button key={star} disabled={disabled} onMouseEnter={() => !disabled && setHoverRating(star)} onMouseLeave={() => setHoverRating(0)} onClick={(e) => { e.preventDefault(); onRate(star); }} className={`transition-all ${disabled ? 'cursor-default opacity-80' : 'hover:scale-125 active:scale-95 cursor-pointer'}`}>
                        <Star size={28} fill={(hoverRating || vote) >= star ? "#fbbf24" : "none"} className={(hoverRating || vote) >= star ? "text-yellow-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]" : "text-gray-400 dark:text-slate-600"} strokeWidth={2}/>
                    </button>
                ))}
            </div>
        );
    };

    const RatingStatsChart = () => {
        const totalVotes = Object.values(ratingStats).reduce((a, b) => a + b, 0);
        const maxVotes = Math.max(...Object.values(ratingStats));
        if (totalVotes === 0) return (<div className="p-4 text-center"><p className="text-gray-500 dark:text-slate-400 text-sm">Нет оценок</p></div>);
        return (
            <div className="space-y-3">
                <div className="text-center"><p className="font-bold text-gray-500 dark:text-slate-400 mb-5">Распределение оценок</p></div>
                {[5, 4, 3, 2, 1].map(rating => (
                    <div key={rating} className="flex items-center gap-3">
                        <div className="flex items-center gap-1 w-8">
                            <Star size={12} fill="#fbbf24" className="text-yellow-400" />
                            <span className="text-xs font-bold text-gray-700 dark:text-slate-200">{rating}</span>
                        </div>
                        <div className="flex-1 h-4 bg-gray-200 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-yellow-500 to-yellow-400 rounded-full transition-all duration-700" style={{ width: `${maxVotes > 0 ? (ratingStats[rating] / maxVotes) * 100 : 0}%` }} />
                        </div>
                        <span className="text-xs font-bold w-6 text-right text-gray-800 dark:text-slate-300">{ratingStats[rating]}</span>
                        <span className="text-xs text-gray-500 dark:text-slate-500 w-10">({maxVotes > 0 ? Math.round((ratingStats[rating] / totalVotes) * 100) : 0}%)</span>
                    </div>
                ))}
                <div className="pt-3 border-t border-gray-300 dark:border-slate-800 text-center">
                    <p className="text-sm text-gray-500 dark:text-slate-400">Всего оценок: <span className="font-bold text-gray-900 dark:text-white">{totalVotes}</span></p>
                    <p className="text-sm text-gray-500 dark:text-slate-400">Средняя: <span className="font-bold text-gray-900 dark:text-white">{profile?.rating?.toFixed(1) || '0.0'}</span></p>
                </div>
            </div>
        );
    };

    if (loading) return (<div className={`h-screen flex flex-col items-center justify-center transition-colors duration-500 ${darkMode ? 'dark bg-[#020617]' : 'bg-gray-100'}`}><div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" /><span className="text-indigo-500 font-black tracking-widest animate-pulse uppercase">Загрузка...</span></div>);
    if (error) return (<div className={`h-screen flex flex-col items-center justify-center transition-colors duration-500 ${darkMode ? 'dark bg-[#020617]' : 'bg-gray-100'}`}><div className="text-red-500 text-xl font-bold mb-4">{error}</div><button onClick={() => navigate('/')} className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors">Вернуться на главную</button></div>);

    return (
        <div className={`min-h-screen transition-colors duration-500 ${darkMode ? 'dark bg-[#020617] text-white' : 'bg-gray-100 text-gray-900'}`}>
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10" />
                <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] bg-indigo-600/10 blur-[120px] rounded-full" />
            </div>

            <div className="relative z-10 max-w-7xl mx-auto px-6 py-10">
                <header className="flex justify-between items-center mb-12">
                    <button onClick={() => navigate(-1)} className="p-4 bg-white/80 dark:bg-slate-900/50 border-2 border-gray-300 dark:border-slate-800 rounded-3xl hover:border-indigo-500 transition-all shadow-xl hover:scale-105"><ChevronLeft className="dark:text-white text-gray-600" /></button>
                    <div className="bg-white/80 dark:bg-slate-900/50 border-2 border-gray-300 dark:border-slate-800 px-6 py-3 rounded-3xl flex items-center gap-3 shadow-md">
                        <div className={`w-2 h-2 rounded-full ${checkIsOnline(profile) ? 'bg-green-500 animate-pulse' : 'bg-gray-400 dark:bg-slate-600'}`} />
                        <span className={`text-[10px] font-black tracking-[0.3em] uppercase opacity-60 ${checkIsOnline(profile) ? 'text-green-600 dark:text-green-500' : 'text-gray-600 dark:text-gray-400'}`}>
                            {checkIsOnline(profile) ? 'Онлайн' : formatLastSeen(profile?.last_seen)}
                        </span>
                    </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                    <div className="lg:col-span-4">
                        <div className="bg-white/90 dark:bg-slate-900/80 border-4 border-gray-200 dark:border-slate-800 rounded-[3.5rem] p-10 text-center shadow-2xl sticky top-10">
                            <div className="relative w-44 h-44 mx-auto mb-8">
                                <div className="absolute inset-0 bg-indigo-500 blur-3xl opacity-20" />
                                <img 
                                    src={profile?.avatar_url || `https://ui-avatars.com/api/?name=${profile?.name || 'User'}&background=4f46e5&color=fff&size=512`} 
                                    className="w-full h-full object-cover rounded-[3rem] border-4 border-gray-100 dark:border-slate-700 relative z-10 shadow-2xl" 
                                    alt={profile?.name}
                                    onError={(e) => {
                                        e.target.onerror = null;
                                        e.target.src = `https://ui-avatars.com/api/?name=${profile?.name || 'User'}&background=4f46e5&color=fff&size=512`;
                                    }}
                                />
                            </div>

                            <h1 className="text-4xl font-black tracking-tighter mb-1 dark:text-white text-gray-900">
                                <AnimatedTitle text={profile?.name || "Пользователь"} />
                            </h1>
                            <p className="text-indigo-600 dark:text-indigo-400 font-bold text-sm tracking-widest mb-8 uppercase opacity-80">@{profile?.username}</p>

                            {!isOwnProfile && currentUser && (
                                <div className="bg-gray-50 dark:bg-slate-800/40 rounded-[2.5rem] p-6 mb-8 border-2 border-gray-200 dark:border-slate-700/50 backdrop-blur-sm shadow-inner">
                                    <h3 className="text-sm font-black uppercase text-gray-500 dark:text-slate-400 mb-4">{hasVoted ? 'Ваша оценка' : 'Поставить оценку'}</h3>
                                    <RatingStars vote={myVote} onRate={handleRate} disabled={hasVoted} />
                                    {hasVoted && <p className="text-xs text-gray-500 dark:text-slate-400 mt-3">Вы оценили на {myVote}/5</p>}
                                </div>
                            )}

                            {!isOwnProfile && currentUser && (
                                <button onClick={goToChat} className="w-full py-5 text-white bg-indigo-600 rounded-[2rem] font-black uppercase tracking-widest shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 transition-all flex items-center justify-center gap-3 group hover:scale-[1.02] active:scale-[0.98] mb-8">
                                    <MessageCircle size={22} fill="currentColor" /> Написать сообщение
                                </button>
                            )}

                            {isOwnProfile && (
                                <div className="bg-gray-50 dark:bg-slate-800/40 rounded-[2.5rem] p-6 mb-8 border-2 border-gray-200 dark:border-slate-700/50 backdrop-blur-sm shadow-inner">                                  
                                    <RatingStatsChart />
                                </div>
                            )}

                            <div className="mt-8 p-6 bg-gray-100/80 dark:bg-slate-950/50 rounded-3xl border-2 border-gray-200 dark:border-slate-800 shadow-inner">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-sm font-black uppercase text-gray-500 dark:text-slate-400">О себе</h3>
                                    {isOwnProfile && !editingBio && (
                                        <button onClick={() => setEditingBio(true)} className="text-indigo-500 dark:text-indigo-400 hover:text-indigo-400 dark:hover:text-indigo-300 transition-colors"><Pencil size={16} /></button>
                                    )}
                                </div>
                                {editingBio ? (
                                    <div className="space-y-3">
                                        <textarea value={newBio} onChange={(e) => setNewBio(e.target.value)} placeholder="Расскажите о себе..." className="w-full bg-white dark:bg-slate-800/50 border-2 border-gray-300 dark:border-slate-700 rounded-xl p-3 text-gray-900 dark:text-white resize-none h-32 outline-none focus:border-indigo-500" maxLength={250} />
                                        <div className="flex gap-2">
                                            <button onClick={handleUpdateBio} className="flex-1 text-white bg-green-600 hover:bg-green-700 py-2 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"><Check size={24} /></button>
                                            <button onClick={() => { setEditingBio(false); setNewBio(profile?.bio || ""); }} className="flex-1 text-white bg-red-600 hover:bg-red-700 py-2 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"><X size={24} /></button>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm font-bold text-gray-700 dark:text-slate-300 leading-relaxed">{profile?.bio ? profile.bio : isOwnProfile ? <span className="text-gray-400 dark:text-slate-500">Расскажите о себе...</span> : <span className="text-gray-400 dark:text-slate-500">Пользователь еще не добавил информацию о себе</span>}</p>
                                )}
                            </div>
                            <div className="mt-6 space-y-3">
                                <div className="flex items-center gap-3 text-gray-500 dark:text-slate-400 justify-center">
                                    <Calendar size={16} />
                                    <span className="text-sm font-bold">Зарегистрирован: {new Date(profile?.$createdAt).toLocaleDateString('ru-RU')}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="lg:col-span-8 space-y-8">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                            <div className="bg-white/90 dark:bg-slate-900/80 border-2 border-gray-200 dark:border-slate-800 p-6 rounded-[2.5rem] flex flex-col items-center shadow-xl hover:border-indigo-500/30 transition-colors">
                                <div className="p-4 rounded-2xl bg-gray-100 dark:bg-slate-800 text-yellow-500 mb-3 shadow-inner"><Star size={24} strokeWidth={3} /></div>
                                <span className="text-2xl font-black dark:text-white text-gray-900">{profile?.rating ? profile.rating.toFixed(1) : '0.0'}</span>
                                <span className="text-[10px] font-black uppercase text-gray-500 dark:text-slate-500 tracking-tighter mt-1">Рейтинг</span>
                                <span className="text-[9px] text-gray-400 dark:text-slate-600 mt-1">({profile?.rating_count || 0} голосов)</span>
                            </div>
                            <div className="bg-white/90 dark:bg-slate-900/80 border-2 border-gray-200 dark:border-slate-800 p-6 rounded-[2.5rem] flex flex-col items-center shadow-xl hover:border-indigo-500/30 transition-colors">
                                <div className="p-4 rounded-2xl bg-gray-100 dark:bg-slate-800 text-blue-500 mb-3 shadow-inner"><MessageCircle size={24} strokeWidth={3} /></div>
                                <span className="text-2xl font-black dark:text-white text-gray-900">{posts.length}</span>
                                <span className="text-[10px] font-black uppercase text-gray-500 dark:text-slate-500 tracking-tighter mt-1">Публикации</span>
                            </div>
                            <div className="bg-white/90 dark:bg-slate-900/80 border-2 border-gray-200 dark:border-slate-800 p-6 rounded-[2.5rem] flex flex-col items-center shadow-xl hover:border-indigo-500/30 transition-colors">
                                <div className="p-4 rounded-2xl bg-gray-100 dark:bg-slate-800 text-red-500 mb-3 shadow-inner"><Heart size={24} strokeWidth={3} /></div>
                                <span className="text-2xl font-black dark:text-white text-gray-900">{posts.reduce((sum, post) => sum + (post.likes?.length || 0), 0)}</span>
                                <span className="text-[10px] font-black uppercase text-gray-500 dark:text-slate-500 tracking-tighter mt-1">Лайки</span>
                            </div>
                            <div className="bg-white/90 dark:bg-slate-900/80 border-2 border-gray-200 dark:border-slate-800 p-6 rounded-[2.5rem] flex flex-col items-center shadow-xl hover:border-indigo-500/30 transition-colors">
                                <div className="p-4 rounded-2xl bg-gray-100 dark:bg-slate-800 text-purple-500 mb-3 shadow-inner"><MessageSquare size={24} strokeWidth={3} /></div>
                                <span className="text-2xl font-black dark:text-white text-gray-900">{posts.reduce((sum, post) => sum + (post.comments_count || 0), 0)}</span>
                                <span className="text-[10px] font-black uppercase text-gray-500 dark:text-slate-500 tracking-tighter mt-1">Комментарии</span>
                            </div>
                        </div>
                        
                        <motion.div 
                            animate={superSlowFloat}
                            className="bg-white/90 dark:bg-slate-900/80 border-4 border-gray-200 dark:border-slate-800 rounded-[4rem] p-10 shadow-2xl"
                        >
                            <div className="flex items-center gap-4 mb-10">
                                <div className="p-4 bg-indigo-600 rounded-3xl text-white shadow-lg shadow-indigo-500/40"><Zap size={24} fill="currentColor" /></div>
                                <h2 className="text-3xl font-black uppercase tracking-tighter dark:text-white text-gray-900">Стена публикаций</h2>
                            </div>
                            {isOwnProfile && (
                                <div className="mb-10 p-6 bg-gray-50 dark:bg-slate-800/40 rounded-[2.5rem] border-2 border-gray-200 dark:border-slate-700/50 shadow-inner">
                                    <textarea value={postText} onChange={(e) => setPostText(e.target.value)} placeholder="Что у вас нового?" className="w-full bg-transparent border-none outline-none dark:text-white text-gray-900 font-bold text-lg resize-none mb-4 h-24 placeholder:text-gray-400 dark:placeholder:text-slate-600" maxLength={1000} />
                                    <AnimatePresence>
                                        {imagePreview && (
                                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="relative w-full mb-6 rounded-3xl overflow-hidden border-2 border-gray-300 dark:border-slate-700 shadow-md">
                                                <img src={imagePreview} className="w-full h-64 object-cover" alt="Предпросмотр медиа" />
                                                <button onClick={clearImageSelection} className="absolute top-4 right-4 p-2 bg-black/60 rounded-xl text-white hover:bg-red-500 transition-colors backdrop-blur-md" title="Удалить фото"><X size={18}/></button>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-4">
                                            <span className="text-gray-500 dark:text-slate-500 text-sm font-bold">{postText.length}/1000 символов</span>
                                            <button onClick={() => fileInputRef.current?.click()} className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 flex items-center gap-2 font-bold transition-colors"><ImageIcon size={18} /> Фото</button>
                                            <input type="file" hidden ref={fileInputRef} onChange={handleImageSelect} accept="image/*" />
                                        </div>
                                        <button onClick={createPost} disabled={isPosting || (!postText.trim() && !postImage)} className="px-8 py-3 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs flex items-center gap-3 hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed">
                                            {isPosting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />} {isPosting ? "ОБРАБОТКА..." : "Опубликовать"}
                                        </button>
                                    </div>
                                </div>
                            )}
                            <div className="space-y-8">
                                <AnimatePresence>
                                {posts.length > 0 ? posts.map(post => {
                                    const actualAvatar = post.author_id === profile?.user_id ? profile?.avatar_url : post.author_avatar;
                                    return (
                                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} key={post.$id} className="p-8 bg-gray-50 dark:bg-slate-800/20 border-2 border-gray-200 dark:border-slate-800/60 rounded-[3rem] hover:border-indigo-500/40 transition-all group shadow-sm hover:shadow-md">
                                            <div className="flex items-start gap-4 mb-4">
                                                <img 
                                                    src={actualAvatar || `https://ui-avatars.com/api/?name=${post.author_name}&background=4f46e5&color=fff&size=128`} 
                                                    className="w-14 h-14 rounded-2xl object-cover border-2 border-gray-300 dark:border-slate-700 shadow-sm" 
                                                    alt={post.author_name}
                                                    onError={(e) => {
                                                        e.target.onerror = null;
                                                        e.target.src = `https://ui-avatars.com/api/?name=${post.author_name}&background=4f46e5&color=fff&size=128`;
                                                    }}
                                                />
                                                <div className="flex-1">
                                                    <div className="flex justify-between items-start">
                                                        <div>
                                                            <h4 className="font-black text-lg dark:text-white text-gray-900">{post.author_name}</h4>
                                                            <p className="text-indigo-600 dark:text-indigo-400 text-sm font-bold">@{post.author_username}</p>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-gray-500 dark:text-slate-500 text-xs font-bold">
                                                                {formatDateWithTime(post.$createdAt)}
                                                            </span>
                                                            {currentUser && post.author_id === currentUser.$id && (
                                                                <button onClick={() => handleDeletePost(post.$id)} className="text-red-500 hover:text-red-400 transition-colors p-1" title="Удалить пост"><Trash2 size={16} /></button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            {post.content && <p className="dark:text-white text-gray-800 text-lg mb-6 whitespace-pre-wrap font-medium">{post.content}</p>}
                                            {post.image_url && (
                                                <div className="mb-6 rounded-[2rem] overflow-hidden border-2 border-gray-200 dark:border-slate-700/50 shadow-md">
                                                    <img 
                                                        src={post.image_url} 
                                                        alt="Прикрепленное медиа" 
                                                        className="w-full h-auto object-cover max-h-[500px]"
                                                        onError={(e) => {
                                                            e.target.onerror = null;
                                                            e.target.style.display = 'none';
                                                        }}
                                                    />
                                                </div>
                                            )}
                                            
                                            <div className="flex items-center gap-6 pt-4 border-t border-gray-200 dark:border-slate-700/50">             
                                                <button onClick={(e) => handleLikePost(post.$id, post.likes || [], e)} className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-bold ${post.likes?.includes(currentUser?.$id) ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20 shadow-sm' : 'text-gray-500 dark:text-slate-400 hover:text-red-500 hover:bg-gray-200 dark:hover:bg-slate-800'}`}>
                                                    <Heart size={20} fill={post.likes?.includes(currentUser?.$id) ? "#ef4444" : "none"} className={post.likes?.includes(currentUser?.$id) ? "text-red-500" : "text-gray-400 dark:text-slate-400"} />
                                                    <span>{(post.likes || []).length}</span>
                                                </button>
                                                <button onClick={() => setShowComments(prev => ({...prev, [post.$id]: !prev[post.$id]}))} className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-bold ${showComments[post.$id] ? 'bg-blue-500/10 text-blue-500 dark:text-blue-400 hover:bg-blue-500/20 shadow-sm' : 'text-gray-500 dark:text-slate-400 hover:text-blue-500 hover:bg-gray-200 dark:hover:bg-slate-800'}`}>
                                                    <MessageSquare size={20} />
                                                    <span>{post.comments_count || 0}</span>
                                                </button>
                                            </div>
                                            <AnimatePresence>
                                                {showComments[post.$id] && (
                                                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-6 pt-6 border-t border-gray-200 dark:border-slate-700/50 overflow-hidden">
                                                        <h5 className="font-black text-sm uppercase text-gray-500 dark:text-slate-400 mb-4">Комментарии</h5>
                                                        
                                                        {replyingTo && replyingTo.postId === post.$id && (
                                                            <div className="mb-4 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-200 dark:border-indigo-800 flex items-center justify-between">
                                                                <div className="flex items-center gap-2">
                                                                    <Reply size={14} className="text-indigo-600" />
                                                                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                                                                        Ответ {replyingTo.author_name}
                                                                    </span>
                                                                </div>
                                                                <button onClick={() => setReplyingTo(null)} className="text-gray-500 hover:text-gray-700">
                                                                    <X size={14} />
                                                                </button>
                                                            </div>
                                                        )}
                                                        
                                                        {currentUser && (
                                                            <div className="mb-6 flex gap-3">
                                                                <img 
                                                                    src={currentUserProfile?.avatar_url || `https://ui-avatars.com/api/?name=${currentUserProfile?.name || 'User'}&background=4f46e5&color=fff&size=64`} 
                                                                    className="w-10 h-10 rounded-xl object-cover border border-gray-300 dark:border-slate-700 shadow-sm" 
                                                                    alt="Ваш аватар"
                                                                    onError={(e) => {
                                                                        e.target.onerror = null;
                                                                        e.target.src = `https://ui-avatars.com/api/?name=${currentUserProfile?.name || 'User'}&background=4f46e5&color=fff&size=64`;
                                                                    }}
                                                                />
                                                                <div className="flex-1 flex gap-2">
                                                                    <input 
                                                                        type="text" 
                                                                        placeholder={replyingTo && replyingTo.postId === post.$id ? `Ответ ${replyingTo.author_name}...` : "Написать комментарий..."} 
                                                                        value={commentTexts[post.$id] || ''} 
                                                                        onChange={(e) => setCommentTexts({...commentTexts, [post.$id]: e.target.value})} 
                                                                        onKeyPress={(e) => { 
                                                                            if (e.key === 'Enter' && e.target.value.trim()) { 
                                                                                handleAddComment(post.$id, e.target.value, replyingTo && replyingTo.postId === post.$id ? replyingTo : null); 
                                                                                setCommentTexts({...commentTexts, [post.$id]: ''}); 
                                                                                setReplyingTo(null);
                                                                            } 
                                                                        }} 
                                                                        className="flex-1 bg-white dark:bg-slate-800/50 border border-gray-300 dark:border-slate-700 rounded-xl px-4 py-2 dark:text-white text-gray-900 outline-none focus:border-indigo-500 transition-colors shadow-inner" 
                                                                    />
                                                                    <button 
                                                                        onClick={() => { 
                                                                            if (commentTexts[post.$id]?.trim()) { 
                                                                                handleAddComment(post.$id, commentTexts[post.$id], replyingTo && replyingTo.postId === post.$id ? replyingTo : null); 
                                                                                setCommentTexts({...commentTexts, [post.$id]: ''}); 
                                                                                setReplyingTo(null);
                                                                            } 
                                                                        }} 
                                                                        className="px-6 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-md"
                                                                    >
                                                                        <Send size={16} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}
                                                        
                                                        <div className="space-y-4 max-h-96 overflow-y-auto custom-scrollbar pr-2">
                                                            <AnimatePresence>
                                                                {(post.comments || []).map(comment => {
                                                                    const isReply = comment.reply_to;
                                                                    return (
                                                                        <motion.div 
                                                                            initial={{ opacity: 0, y: -5 }} 
                                                                            animate={{ opacity: 1, y: 0 }} 
                                                                            exit={{ opacity: 0, scale: 0.9 }} 
                                                                            key={comment.$id} 
                                                                            className={`flex gap-3 group ${isReply ? 'ml-8' : ''}`}
                                                                        >
                                                                            <img 
                                                                                src={comment.author_avatar || `https://ui-avatars.com/api/?name=${comment.author_name}&background=4f46e5&color=fff&size=64`} 
                                                                                className="w-8 h-8 rounded-lg object-cover shadow-sm border border-gray-200 dark:border-slate-700" 
                                                                                alt={comment.author_name}
                                                                                onError={(e) => {
                                                                                    e.target.onerror = null;
                                                                                    e.target.src = `https://ui-avatars.com/api/?name=${comment.author_name}&background=4f46e5&color=fff&size=64`;
                                                                                }}
                                                                            />
                                                                            <div className="flex-1 bg-gray-100 dark:bg-slate-800/30 rounded-xl p-3 border border-gray-200 dark:border-slate-700/30 shadow-sm">
                                                                                <div className="flex justify-between items-start mb-1">
                                                                                    <div className="flex items-center gap-2">
                                                                                        <span className="font-bold text-sm dark:text-white text-gray-900">{comment.author_name}</span>
                                                                                        {comment.reply_to_author && (
                                                                                            <span className="text-xs text-indigo-500 dark:text-indigo-400 flex items-center gap-1">
                                                                                                <Reply size={10} /> {comment.reply_to_author}
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                    <div className="flex items-center gap-2">
                                                                                        <span className="text-[10px] text-gray-500 dark:text-slate-500 font-bold">
                                                                                            {formatDateWithTime(comment.$createdAt)}
                                                                                        </span>
                                                                                        {currentUser && (comment.author_id === currentUser.$id || isOwnProfile) && (
                                                                                            <button onClick={() => handleDeleteComment(post.$id, comment.$id)} className="text-gray-400 dark:text-slate-500 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100" title="Удалить комментарий"><Trash2 size={14} /></button>
                                                                                        )}
                                                                                        {currentUser && comment.author_id !== currentUser.$id && (
                                                                                            <button 
                                                                                                onClick={() => setReplyingTo({...comment, postId: post.$id})} 
                                                                                                className="text-gray-400 dark:text-slate-500 hover:text-indigo-500 transition-colors opacity-0 group-hover:opacity-100"
                                                                                                title="Ответить"
                                                                                            >
                                                                                                <Reply size={14} />
                                                                                            </button>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                                <p className="text-sm text-gray-700 dark:text-slate-300 font-medium">{comment.content}</p>
                                                                            </div>
                                                                        </motion.div>
                                                                    );
                                                                })}
                                                            </AnimatePresence>
                                                            {(post.comments || []).length === 0 && <p className="text-center text-gray-500 dark:text-slate-500 text-sm py-4 font-bold">Пока нет комментариев. Будьте первым!</p>}
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </motion.div>
                                    );
                                }) : (
                                    <div className="p-20 border-4 border-dashed border-gray-300 dark:border-slate-800 rounded-[3rem] shadow-inner bg-gray-50 dark:bg-transparent">
                                        <p className="font-black uppercase text-center text-gray-400 dark:text-slate-600 tracking-[0.3em]">{isOwnProfile ? "У вас пока нет публикаций" : "Пользователь еще ничего не публиковал"}</p>
                                    </div>
                                )}
                                </AnimatePresence>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Profile;