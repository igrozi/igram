/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { databases, account, client, storage, DATABASE_ID, COLLECTION_ID_PROFILES, COLLECTION_ID_POSTS, COLLECTION_ID_COMMENTS, COLLECTION_ID_RATINGS, BUCKET_ID_POSTS } from '../appwriteConfig';
import { Query, ID } from 'appwrite';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, MessageCircle, Star, Zap, Heart, MessageSquare, Send, Pencil, Check, X, Calendar, Trash2, Image as ImageIcon, Loader2, Reply, Pin, PinOff } from 'lucide-react';

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
    const bioInputRef = useRef(null);
    const [profile, setProfile] = useState(null);
    const [allPosts, setAllPosts] = useState([]);
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
    const [postText, setPostText] = useState("");
    const [postImage, setPostImage] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [isPosting, setIsPosting] = useState(false);
    const [isUpdatingBio, setIsUpdatingBio] = useState(false);
    const [ratingStats, setRatingStats] = useState({1: 0, 2: 0, 3: 0, 4: 0, 5: 0, total: 0, average: 0});
    const [isLoadingStats, setIsLoadingStats] = useState(true);
    const [darkMode, setDarkMode] = useState(localStorage.getItem('theme') === 'dark');

    const isOwnProfile = useMemo(() => {
        return currentUser && profile && currentUser.$id === profile.user_id;
    }, [currentUser, profile]);
    
    // Функция сортировки постов
    const sortPosts = useCallback((posts) => {
        return [...posts].sort((a, b) => {
            if (a.is_pinned && !b.is_pinned) return -1;
            if (!a.is_pinned && b.is_pinned) return 1;
            if (a.is_pinned && b.is_pinned) {
                const dateA = a.pinned_at ? new Date(a.pinned_at) : new Date(0);
                const dateB = b.pinned_at ? new Date(b.pinned_at) : new Date(0);
                return dateB - dateA;
            }
            return new Date(b.$createdAt) - new Date(a.$createdAt);
        });
    }, []);

    // Получение статистики оценок
    const fetchRatingStats = useCallback(async (userId) => {
        try {
            const ratingsRes = await databases.listDocuments(DATABASE_ID, COLLECTION_ID_RATINGS, [Query.equal('rated_user_id', userId), Query.limit(100)]);
            const stats = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0};
            let total = 0;
            let sum = 0;
            
            ratingsRes.documents.forEach(r => {
                if (r.score && stats[r.score] !== undefined) {
                    stats[r.score]++;
                    total++;
                    sum += r.score;
                }
            });
            
            const average = total > 0 ? sum / total : 0;
            return { stats, total, average };
        } catch (err) {
            console.error("Ошибка загрузки статистики оценок:", err);
            return { stats: {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}, total: 0, average: 0 };
        }
    }, []);

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
                setIsLoadingStats(true);
                const { stats, total, average } = await fetchRatingStats(profDoc.user_id);
                setRatingStats({ ...stats, total, average });
                setIsLoadingStats(false);
            }

            const postsRes = await databases.listDocuments(DATABASE_ID, COLLECTION_ID_POSTS, [Query.equal('author_id', profDoc.user_id), Query.orderDesc('$createdAt'), Query.limit(50)]);
            
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
            
            const sortedPosts = sortPosts(postsWithComments);
            setAllPosts(sortedPosts);
        } catch (err) { 
            console.error(err);
            setError("Не удалось загрузить данные профиля."); 
        } finally { setLoading(false); }
    }, [username, navigate, sortPosts, fetchRatingStats]);

    useEffect(() => {
        fetchProfileData();
    }, [fetchProfileData]);

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

    const handleRate = useCallback(async (score) => {
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
            
            if (isOwnProfile) {
                const { stats, total, average } = await fetchRatingStats(profile.user_id);
                setRatingStats({ ...stats, total, average });
            }
        } catch (e) { 
            console.error(e);
            alert("Не удалось сохранить оценку."); 
        }
    }, [isOwnProfile, currentUser, profile, hasVoted, fetchRatingStats]);

    const handleUpdateBio = async () => {
        if (!isOwnProfile || !profile || isUpdatingBio) return;
        setIsUpdatingBio(true);
        try {
            await databases.updateDocument(DATABASE_ID, COLLECTION_ID_PROFILES, profile.$id, { bio: newBio });
            setEditingBio(false);
        } catch (error) { 
            alert("Ошибка сохранения биографии.");  
            console.error("Ошибка при обновлении биографии:", error); 
        } finally {
            setIsUpdatingBio(false);
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
                created_at: new Date().toISOString(),
                is_pinned: false,
                pinned_at: null
            });
            
            setAllPosts(prev => {
                if (prev.find(p => p.$id === newPost.$id)) return prev;
                return sortPosts([...prev, { ...newPost, comments: [] }]);
            });
            setPostText(""); clearImageSelection();
        } catch (error) { 
            alert("Не удалось опубликовать запись."); 
            console.error("Ошибка при создании поста:", error); 
        } finally { setIsPosting(false); }
    };

    const handleTogglePinPost = useCallback(async (postId, isCurrentlyPinned) => {
        if (!isOwnProfile) return;
        
        try {
            const pinnedAt = !isCurrentlyPinned ? new Date().toISOString() : null;
            
            await databases.updateDocument(DATABASE_ID, COLLECTION_ID_POSTS, postId, { 
                is_pinned: !isCurrentlyPinned,
                pinned_at: pinnedAt
            });
            
            setAllPosts(prev => {
                const updatedPosts = prev.map(post => 
                    post.$id === postId 
                        ? { ...post, is_pinned: !isCurrentlyPinned, pinned_at: pinnedAt }
                        : post
                );
                return sortPosts(updatedPosts);
            });
        } catch (error) {
            console.error("Ошибка при закреплении/откреплении поста:", error);
            alert("Не удалось изменить статус поста.");
        }
    }, [isOwnProfile, sortPosts]);

    const handleDeletePost = useCallback(async (postId) => {
        if (!currentUser || !profile) return;
        if (!window.confirm("Удалить пост? Действие необратимо.")) return;
        try {
            const postToDelete = allPosts.find(p => p.$id === postId);
            if (!postToDelete || postToDelete.author_id !== currentUser.$id) return;
            await databases.deleteDocument(DATABASE_ID, COLLECTION_ID_POSTS, postId);
            setAllPosts(prev => prev.filter(p => p.$id !== postId));
        } catch (error) { alert("Сбой при удалении."); console.error("Ошибка при удалении поста:", error); }
    }, [currentUser, profile, allPosts]);

    const handleLikePost = useCallback(async (postId, currentLikes = [], e) => {
        if (e) e.preventDefault();
        if (!currentUser) return;
        const userId = currentUser.$id;
        const hasLiked = currentLikes.includes(userId);
        try {
            const updatedLikes = hasLiked ? currentLikes.filter(id => id !== userId) : [...currentLikes, userId];
            
            setAllPosts(prev => prev.map(post => 
                post.$id === postId ? { ...post, likes: updatedLikes } : post
            ));
            
            await databases.updateDocument(DATABASE_ID, COLLECTION_ID_POSTS, postId, { likes: updatedLikes });
        } catch (error) { console.error("Ошибка при обновлении лайков:", error); }
    }, [currentUser]);

    const handleAddComment = useCallback(async (postId, commentText, replyToComment = null) => {
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
            
            setAllPosts(prev => prev.map(post => {
                if (post.$id === postId) {
                    const newComments = [...(post.comments || []), newComment];
                    return { ...post, comments: newComments, comments_count: newComments.length };
                }
                return post;
            }));
        } catch (e) { 
            console.error("Ошибка при добавлении комментария:", e);
            alert("Не удалось отправить комментарий."); 
        }
    }, [currentUser, currentUserProfile]);

    const handleDeleteComment = useCallback(async (postId, commentId) => {
        if (!currentUser) return;
        if (!window.confirm("Удалить этот комментарий?")) return;
        
        try {
            await databases.deleteDocument(DATABASE_ID, COLLECTION_ID_COMMENTS, commentId);
            
            setAllPosts(prev => prev.map(p => {
                if (p.$id === postId) {
                    const filteredComments = p.comments?.filter(c => c.$id !== commentId) || [];
                    return { ...p, comments: filteredComments, comments_count: filteredComments.length };
                }
                return p;
            }));
        } catch (error) { 
            console.error(error);
            alert("Не удалось удалить комментарий."); 
        }
    }, [currentUser]);

    const RatingStars = ({ vote, onRate, disabled }) => {
        return (
            <div className="flex justify-center gap-1">
                {[1, 2, 3, 4, 5].map(star => (
                    <button key={star} disabled={disabled} onMouseEnter={() => !disabled && setHoverRating(star)} onMouseLeave={() => setHoverRating(0)} onClick={(e) => { e.preventDefault(); onRate(star); }} className={`transition-all cursor-pointer ${disabled ? 'cursor-default opacity-80' : 'hover:scale-125 active:scale-95'}`}>
                        <Star size={28} fill={(hoverRating || vote) >= star ? "#fbbf24" : "none"} className={(hoverRating || vote) >= star ? "text-yellow-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]" : "text-gray-400 dark:text-slate-600"} strokeWidth={2}/>
                    </button>
                ))}
            </div>
        );
    };

    const RatingStatsChart = () => {
        if (isLoadingStats) {
            return (
                <div className="p-4 text-center">
                    <Loader2 className="animate-spin mx-auto text-indigo-500" size={20} />
                </div>
            );
        }
        
        if (ratingStats.total === 0) {
            return (
                <div className="p-4 text-center">
                    <p className="text-gray-500 dark:text-slate-400 text-xs">Нет оценок</p>
                </div>
            );
        }
        
        return (
            <div className="space-y-3">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1">
                        <Star size={16} fill="#fbbf24" className="text-yellow-400" />
                        <span className="text-lg font-black dark:text-white">{ratingStats.average.toFixed(1)}</span>
                        <span className="text-xs text-gray-500">/ 5</span>
                    </div>
                    <span className="text-xs text-gray-500 dark:text-slate-400">{ratingStats.total} оценок</span>
                </div>
                
                <div className="space-y-1.5">
                    {[5, 4, 3, 2, 1].map(rating => {
                        const count = ratingStats[rating];
                        const percentage = ratingStats.total > 0 ? (count / ratingStats.total) * 100 : 0;
                        return (
                            <div key={rating} className="flex items-center gap-2">
                                <div className="flex items-center gap-0.5 w-8">
                                    <span className="text-xs font-semibold text-gray-600 dark:text-slate-400">{rating}</span>
                                    <Star size={8} fill="#fbbf24" className="text-yellow-400" />
                                </div>
                                <div className="flex-1">
                                    <div className="h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                        <div 
                                            className="h-full bg-gradient-to-r from-yellow-500 to-yellow-400 rounded-full transition-all duration-500 ease-out"
                                            style={{ width: `${percentage}%` }}
                                        />
                                    </div>
                                </div>
                                <div className="w-8 text-right">
                                    <span className="text-xs font-medium text-gray-600 dark:text-slate-400">{count}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const PostComponent = memo(({ post }) => {
        const actualAvatar = post.author_id === profile?.user_id ? profile?.avatar_url : post.author_avatar;
        const isPinned = post.is_pinned;
        const [localCommentText, setLocalCommentText] = useState('');
        const [localReplyingTo, setLocalReplyingTo] = useState(null);
        const [isAddingComment, setIsAddingComment] = useState(false);
        const isCommentsOpen = showComments[post.$id] || false;
        
        const handleAddCommentLocal = async () => {
            if (!localCommentText.trim() || isAddingComment) return;
            setIsAddingComment(true);
            const text = localCommentText;
            const reply = localReplyingTo;
            setLocalCommentText('');
            setLocalReplyingTo(null);
            await handleAddComment(post.$id, text, reply);
            setIsAddingComment(false);
        };
        
        return (
            <div className={`p-8 bg-gray-50 dark:bg-slate-800/20 border-2 ${isPinned ? 'border-yellow-500/60 bg-yellow-500/5' : 'border-gray-200 dark:border-slate-800/60'} rounded-[3rem] transition-all group shadow-sm hover:shadow-md`}>
                {isPinned && (
                    <div className="flex items-center gap-2 mb-4 text-yellow-500">
                        <Pin size={16} />
                        <span className="text-xs font-black uppercase tracking-wider">Закреплено</span>
                    </div>
                )}
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
                                    <>
                                        <button onClick={() => handleTogglePinPost(post.$id, isPinned)} className="text-yellow-500 hover:text-yellow-400 transition-colors p-1 cursor-pointer" title={isPinned ? "Открепить" : "Закрепить"}>
                                            {isPinned ? <PinOff size={16} /> : <Pin size={16} />}
                                        </button>
                                        <button onClick={() => handleDeletePost(post.$id)} className="text-red-500 hover:text-red-400 transition-colors p-1 cursor-pointer" title="Удалить пост"><Trash2 size={16} /></button>
                                    </>
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
                    <button onClick={(e) => handleLikePost(post.$id, post.likes || [], e)} className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-bold cursor-pointer ${post.likes?.includes(currentUser?.$id) ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20 shadow-sm' : 'text-gray-500 dark:text-slate-400 hover:text-red-500 hover:bg-gray-200 dark:hover:bg-slate-800'}`}>
                        <Heart size={20} fill={post.likes?.includes(currentUser?.$id) ? "#ef4444" : "none"} className={post.likes?.includes(currentUser?.$id) ? "text-red-500" : "text-gray-400 dark:text-slate-400"} />
                        <span>{(post.likes || []).length}</span>
                    </button>
                    <button 
                        onClick={() => setShowComments(prev => ({...prev, [post.$id]: !prev[post.$id]}))} 
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-bold cursor-pointer ${isCommentsOpen ? 'bg-blue-500/10 text-blue-500 dark:text-blue-400 hover:bg-blue-500/20 shadow-sm' : 'text-gray-500 dark:text-slate-400 hover:text-blue-500 hover:bg-gray-200 dark:hover:bg-slate-800'}`}
                    >
                        <MessageSquare size={20} />
                        <span>{post.comments_count || 0}</span>
                    </button>
                </div>
                
                <AnimatePresence mode="wait">
                    {isCommentsOpen && (
                        <motion.div 
                            initial={{ opacity: 0, height: 0 }} 
                            animate={{ opacity: 1, height: 'auto' }} 
                            exit={{ opacity: 0, height: 0 }} 
                            transition={{ duration: 0.2 }}
                            className="mt-6 pt-6 border-t border-gray-200 dark:border-slate-700/50 overflow-hidden"
                        >
                            <h5 className="font-black text-sm uppercase text-gray-500 dark:text-slate-400 mb-4">Комментарии</h5>
                            
                            {localReplyingTo && (
                                <div className="mb-4 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-200 dark:border-indigo-800 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Reply size={14} className="text-indigo-600" />
                                        <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                                            Ответ {localReplyingTo.author_name}
                                        </span>
                                    </div>
                                    <button onClick={() => setLocalReplyingTo(null)} className="text-gray-500 hover:text-gray-700 cursor-pointer">
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
                                            placeholder={localReplyingTo ? `Ответ ${localReplyingTo.author_name}...` : "Написать комментарий..."} 
                                            value={localCommentText} 
                                            onChange={(e) => setLocalCommentText(e.target.value)} 
                                            onKeyPress={(e) => { 
                                                if (e.key === 'Enter' && e.target.value.trim()) { 
                                                    handleAddCommentLocal();
                                                } 
                                            }} 
                                            className="flex-1 bg-white dark:bg-slate-800/50 border border-gray-300 dark:border-slate-700 rounded-xl px-4 py-2 dark:text-white text-gray-900 outline-none focus:border-indigo-500 transition-colors shadow-inner" 
                                        />
                                        <button 
                                            onClick={handleAddCommentLocal}
                                            disabled={isAddingComment}
                                            className="px-6 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-md cursor-pointer disabled:opacity-50"
                                        >
                                            {isAddingComment ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                                        </button>
                                    </div>
                                </div>
                            )}
                            
                            <div className="space-y-4 max-h-96 overflow-y-auto custom-scrollbar pr-2">
                                {(post.comments || []).map(comment => {
                                    const isReply = comment.reply_to;
                                    return (
                                        <div key={comment.$id} className={`flex gap-3 group ${isReply ? 'ml-8' : ''}`}>
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
                                                            <button onClick={() => handleDeleteComment(post.$id, comment.$id)} className="text-gray-400 dark:text-slate-500 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer" title="Удалить комментарий"><Trash2 size={14} /></button>
                                                        )}
                                                        {currentUser && comment.author_id !== currentUser.$id && (
                                                            <button 
                                                                onClick={() => setLocalReplyingTo(comment)} 
                                                                className="text-gray-400 dark:text-slate-500 hover:text-indigo-500 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                                                                title="Ответить"
                                                            >
                                                                <Reply size={14} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                <p className="text-sm text-gray-700 dark:text-slate-300 font-medium">{comment.content}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                                {(post.comments || []).length === 0 && (
                                    <p className="text-center text-gray-500 dark:text-slate-500 text-sm py-4 font-bold">Пока нет комментариев. Будьте первым!</p>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        );
    });

    if (loading) return (
        <div className={`h-screen flex flex-col items-center justify-center transition-colors duration-500 ${darkMode ? 'dark bg-[#020617]' : 'bg-gray-100'}`}>
            <div className="relative">
                <div className="absolute inset-0 bg-indigo-500 blur-3xl opacity-20 animate-pulse" />
                <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4 relative" />
            </div>
            <span className="text-indigo-500 font-black tracking-widest animate-pulse uppercase">Загрузка...</span>
        </div>
    );
    
    if (error) return (
        <div className={`h-screen flex flex-col items-center justify-center transition-colors duration-500 ${darkMode ? 'dark bg-[#020617]' : 'bg-gray-100'}`}>
            <div className="text-red-500 text-xl font-bold mb-4">{error}</div>
            <button onClick={() => navigate('/')} className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors cursor-pointer">Вернуться на главную</button>
        </div>
    );

    const totalLikes = allPosts.reduce((sum, post) => sum + (post.likes?.length || 0), 0);
    const totalComments = allPosts.reduce((sum, post) => sum + (post.comments_count || 0), 0);

    return (
        <div className={`min-h-screen transition-colors duration-500 ${darkMode ? 'dark bg-[#020617]' : 'bg-gray-100'}`}>
            <style>{`
                @keyframes gradientShift { 
                    0% { background-position: 0% 50%; } 
                    50% { background-position: 100% 50%; } 
                    100% { background-position: 0% 50%; } 
                }
                .animated-bg { 
                    position: fixed; 
                    inset: 0; 
                    z-index: 0; 
                    background: ${darkMode ? 'linear-gradient(-45deg, #020617, #1e1b4b, #0f172a, #020617)' : 'linear-gradient(-45deg, #f3f4f6, #e5e7eb, #d1d5db, #f3f4f6)'}; 
                    background-size: 400% 400%; 
                    animation: gradientShift 15s ease infinite; 
                    opacity: 0.8; 
                }
            `}</style>
            <div className="animated-bg" />
            
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10" />
            </div>

            <div className="relative z-10 max-w-7xl mx-auto px-6 py-10">
                <header className="flex justify-between items-center mb-12">
                    <button onClick={() => navigate(-1)} className="p-4 bg-white/80 dark:bg-slate-900/50 border-2 border-gray-300 dark:border-slate-800 rounded-3xl hover:border-indigo-500 transition-all shadow-xl hover:scale-105 cursor-pointer backdrop-blur-sm"><ChevronLeft className="dark:text-white text-gray-600" /></button>
                    <div className="bg-white/80 dark:bg-slate-900/50 border-2 border-gray-300 dark:border-slate-800 px-6 py-3 rounded-3xl flex items-center gap-3 shadow-md backdrop-blur-sm">
                        <div className={`w-2 h-2 rounded-full ${checkIsOnline(profile) ? 'bg-green-500 animate-pulse' : 'bg-gray-400 dark:bg-slate-600'}`} />
                        <span className={`text-[10px] font-black tracking-[0.3em] uppercase opacity-60 ${checkIsOnline(profile) ? 'text-green-600 dark:text-green-500' : 'text-gray-600 dark:text-gray-400'}`}>
                            {checkIsOnline(profile) ? 'Онлайн' : formatLastSeen(profile?.last_seen)}
                        </span>
                    </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                    {/* Левая колонка - профиль */}
                    <div className="lg:col-span-4">
                        <div className="bg-white/90 dark:bg-slate-900/80 backdrop-blur-md border-4 border-gray-200 dark:border-slate-800 rounded-[3.5rem] p-10 text-center shadow-2xl sticky top-10">
                            <div className="relative w-44 h-44 mx-auto mb-8">
                                <div className="absolute inset-0 bg-indigo-500 blur-3xl opacity-20 rounded-full" />
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

                            {/* Блок с оценкой */}
                            {!isOwnProfile && currentUser && (
                                <div className="bg-gray-50 dark:bg-slate-800/40 rounded-[2.5rem] p-6 mb-8 border-2 border-gray-200 dark:border-slate-700/50 backdrop-blur-sm shadow-inner">
                                    <h3 className="text-sm font-black uppercase text-gray-500 dark:text-slate-400 mb-4">{hasVoted ? 'Ваша оценка' : 'Поставить оценку'}</h3>
                                    <RatingStars vote={myVote} onRate={handleRate} disabled={hasVoted} />
                                    {hasVoted && <p className="text-xs text-gray-500 dark:text-slate-400 mt-3">Вы оценили на {myVote}/5</p>}
                                </div>
                            )}

                            {/* Кнопка чата */}
                            {!isOwnProfile && currentUser && (
                                <button onClick={goToChat} className="w-full py-5 text-white bg-indigo-600 rounded-[2rem] font-black uppercase tracking-widest shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 transition-all flex items-center justify-center gap-3 group hover:scale-[1.02] active:scale-[0.98] mb-8 cursor-pointer">
                                    <MessageCircle size={22} fill="currentColor" /> Написать сообщение
                                </button>
                            )}

                            {/* Блок с биографией */}
                            <div className="mt-8 p-6 bg-gray-100/80 dark:bg-slate-950/50 rounded-3xl border-2 border-gray-200 dark:border-slate-800 shadow-inner">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-sm font-black uppercase text-gray-500 dark:text-slate-400">О себе</h3>
                                    {isOwnProfile && !editingBio && (
                                        <button onClick={() => {
                                            setEditingBio(true);
                                            setTimeout(() => bioInputRef.current?.focus(), 100);
                                        }} className="text-indigo-500 dark:text-indigo-400 hover:text-indigo-400 dark:hover:text-indigo-300 transition-colors cursor-pointer">
                                            <Pencil size={16} />
                                        </button>
                                    )}
                                </div>
                                {editingBio ? (
                                    <div className="space-y-3">
                                        <textarea 
                                            ref={bioInputRef}
                                            value={newBio} 
                                            onChange={(e) => setNewBio(e.target.value)} 
                                            placeholder="Расскажите о себе..." 
                                            className="w-full bg-white dark:bg-slate-800/50 border-2 border-gray-300 dark:border-slate-700 rounded-xl p-3 text-gray-900 dark:text-white resize-none h-32 outline-none focus:border-indigo-500" 
                                            maxLength={250} 
                                        />
                                        <div className="flex gap-2">
                                            <button onClick={handleUpdateBio} disabled={isUpdatingBio} className="flex-1 text-white bg-indigo-600 hover:bg-indigo-700 py-2 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50">
                                                {isUpdatingBio ? <Loader2 size={20} className="animate-spin" /> : <Check size={24} />}
                                            </button>
                                            <button onClick={() => { setEditingBio(false); setNewBio(profile?.bio || ""); }} className="flex-1 text-white bg-gray-800 hover:bg-gray-700 py-2 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer">
                                                <X size={24} />
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm font-bold text-gray-700 dark:text-slate-300 leading-relaxed break-words whitespace-pre-wrap">
                                        {profile?.bio ? profile.bio : (isOwnProfile ? 
                                            <span className="text-gray-400 dark:text-slate-500">Нажмите на карандаш, чтобы добавить информацию о себе</span> : 
                                            <span className="text-gray-400 dark:text-slate-500">Пользователь еще не добавил информацию о себе</span>
                                        )}
                                    </p>
                                )}
                            </div>

                            {/* Отдельный блок со статистикой оценок */}
                            {isOwnProfile && (
                                <div className="mt-6 p-6 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 dark:from-indigo-500/5 dark:to-purple-500/5 rounded-3xl border-2 border-indigo-500/20 dark:border-indigo-500/10 shadow-inner">
                                    <div className="flex items-center gap-2 mb-4">
                                        <div className="p-1.5 bg-indigo-600 rounded-lg">
                                            <Star size={14} className="text-white" />
                                        </div>
                                        <h3 className="text-sm font-black uppercase text-gray-600 dark:text-slate-300">Статистика оценок</h3>
                                    </div>
                                    <RatingStatsChart />
                                </div>
                            )}
                            
                            <div className="mt-6 space-y-3">
                                <div className="flex items-center gap-3 text-gray-500 dark:text-slate-400 justify-center">
                                    <Calendar size={16} />
                                    <span className="text-sm font-bold">Зарегистрирован: {new Date(profile?.$createdAt).toLocaleDateString('ru-RU')}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    {/* Правая колонка - посты и статистика */}
                    <div className="lg:col-span-8 space-y-8">
                        {/* Статистика профиля */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-white/90 dark:bg-slate-900/80 backdrop-blur-md border-2 border-gray-200 dark:border-slate-800 p-4 rounded-[2rem] flex flex-col items-center shadow-xl hover:border-indigo-500/30 transition-colors">
                                <Star size={24} className="text-yellow-500 mb-2" />
                                <span className="text-2xl font-black dark:text-white text-gray-900">{profile?.rating ? profile.rating.toFixed(1) : '0.0'}</span>
                                <span className="text-[10px] font-black uppercase text-gray-500 dark:text-slate-500 text-center">Рейтинг</span>
                                <span className="text-[9px] text-gray-400 dark:text-slate-600">({profile?.rating_count || 0})</span>
                            </div>
                            <div className="bg-white/90 dark:bg-slate-900/80 backdrop-blur-md border-2 border-gray-200 dark:border-slate-800 p-4 rounded-[2rem] flex flex-col items-center shadow-xl hover:border-indigo-500/30 transition-colors">
                                <MessageCircle size={24} className="text-blue-500 mb-2" />
                                <span className="text-2xl font-black dark:text-white text-gray-900">{allPosts.length}</span>
                                <span className="text-[10px] font-black uppercase text-gray-500 dark:text-slate-500 text-center">Посты</span>
                            </div>
                            <div className="bg-white/90 dark:bg-slate-900/80 backdrop-blur-md border-2 border-gray-200 dark:border-slate-800 p-4 rounded-[2rem] flex flex-col items-center shadow-xl hover:border-indigo-500/30 transition-colors">
                                <Heart size={24} className="text-red-500 mb-2" />
                                <span className="text-2xl font-black dark:text-white text-gray-900">{totalLikes}</span>
                                <span className="text-[10px] font-black uppercase text-gray-500 dark:text-slate-500 text-center">Лайки</span>
                            </div>
                            <div className="bg-white/90 dark:bg-slate-900/80 backdrop-blur-md border-2 border-gray-200 dark:border-slate-800 p-4 rounded-[2rem] flex flex-col items-center shadow-xl hover:border-indigo-500/30 transition-colors">
                                <MessageSquare size={24} className="text-purple-500 mb-2" />
                                <span className="text-2xl font-black dark:text-white text-gray-900">{totalComments}</span>
                                <span className="text-[10px] font-black uppercase text-gray-500 dark:text-slate-500 text-center">Комменты</span>
                            </div>
                        </div>
                        
                        {/* Стена публикаций */}
                        <div className="bg-white/90 dark:bg-slate-900/80 backdrop-blur-md border-4 border-gray-200 dark:border-slate-800 rounded-[4rem] p-10 shadow-2xl">
                            <div className="flex items-center gap-4 mb-10">
                                <div className="p-4 bg-indigo-600 rounded-3xl text-white shadow-lg shadow-indigo-500/40"><Zap size={24} fill="currentColor" /></div>
                                <h2 className="text-3xl font-black uppercase tracking-tighter dark:text-white text-gray-900">Стена публикаций</h2>
                            </div>
                            
                            {/* Форма создания поста - для владельца */}
                            {isOwnProfile && (
                                <div className="mb-10 p-6 bg-gray-50 dark:bg-slate-800/40 rounded-[2.5rem] border-2 border-gray-200 dark:border-slate-700/50 shadow-inner">
                                    <textarea 
                                        value={postText} 
                                        onChange={(e) => setPostText(e.target.value)} 
                                        placeholder="Что у вас нового?" 
                                        className="w-full bg-transparent border-none outline-none dark:text-white text-gray-900 font-bold text-lg resize-none mb-4 h-24 placeholder:text-gray-400 dark:placeholder:text-slate-600" 
                                        maxLength={1000} 
                                    />
                                    <AnimatePresence>
                                        {imagePreview && (
                                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="relative w-full mb-6 rounded-3xl overflow-hidden border-2 border-gray-300 dark:border-slate-700 shadow-md">
                                                <img src={imagePreview} className="w-full h-64 object-cover" alt="Предпросмотр медиа" />
                                                <button onClick={clearImageSelection} className="absolute top-4 right-4 p-2 bg-black/60 rounded-xl text-white hover:bg-red-500 transition-colors backdrop-blur-md cursor-pointer" title="Удалить фото"><X size={18}/></button>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-4">
                                            <span className="text-gray-500 dark:text-slate-500 text-sm font-bold">{postText.length}/1000 символов</span>
                                            <button onClick={() => fileInputRef.current?.click()} className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 flex items-center gap-2 font-bold transition-colors cursor-pointer"><ImageIcon size={18} /> Фото</button>
                                            <input type="file" hidden ref={fileInputRef} onChange={handleImageSelect} accept="image/*" />
                                        </div>
                                        <button onClick={createPost} disabled={isPosting || (!postText.trim() && !postImage)} className="px-8 py-3 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs flex items-center gap-3 hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
                                            {isPosting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />} {isPosting ? "ОБРАБОТКА..." : "Опубликовать"}
                                        </button>
                                    </div>
                                </div>
                            )}
                            
                            {/* Список постов */}
                            <div className="space-y-8">
                                {allPosts.map(post => (
                                    <PostComponent key={post.$id} post={post} />
                                ))}
                                
                                {allPosts.length === 0 && (
                                    <div className="p-20 border-4 border-dashed border-gray-300 dark:border-slate-800 rounded-[3rem] shadow-inner bg-gray-50 dark:bg-transparent">
                                        <p className="font-black uppercase text-center text-gray-400 dark:text-slate-600 tracking-[0.3em]">{isOwnProfile ? "У вас пока нет публикаций" : "Пользователь еще ничего не публиковал"}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Profile;