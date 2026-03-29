import React, { useState, useEffect, useRef, memo } from 'react';
import { account, databases, storage, client, DATABASE_ID, COLLECTION_ID_PROFILES, BUCKET_ID_AVATARS } from '../appwriteConfig';
import { Query, ID } from 'appwrite';
import { motion, AnimatePresence } from 'framer-motion'; motion;
import { 
    ChevronLeft, Save, User, Bell, ShieldCheck, Mail, Lock, 
    Camera, Eye, EyeOff, Zap, LogOut, Sun, Moon, CheckCircle, 
    Loader2, Activity, Shield, ShieldAlert, Key,
    Phone, LockKeyhole, Pencil, X, Fingerprint, Cpu, Layers, Globe
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const heartBeat = { scale: [1, 1.2, 1], transition: { duration: 1.5, repeat: Infinity, ease: "easeInOut" } };
const floatingHigh = { y: [0, -10, 0], transition: { duration: 2.5, repeat: Infinity, ease: "easeInOut" } };

const formatPhoneNumber = (value) => {
    if (!value) return '';
    const numbers = value.replace(/\D/g, '');
    if (numbers.length === 0) return '';
    if (numbers.length <= 1) return '+7 ';
    let result = '+7 ';
    if (numbers.length > 1) result += '(' + numbers.substring(1, 4);
    if (numbers.length >= 5) result += ') ' + numbers.substring(4, 7);
    if (numbers.length >= 8) result += '-' + numbers.substring(7, 9);
    if (numbers.length >= 10) result += '-' + numbers.substring(9, 11);
    return result;
};

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

// eslint-disable-next-line no-unused-vars
const SectionHeader = ({ icon: Icon, text, animate = heartBeat }) => (
    <div className="flex items-center gap-4 mb-10 relative z-10">
        <motion.div 
            animate={animate} 
            className="bg-indigo-600 p-2.5 rounded-2xl shadow-[0_0_20px_rgba(79,70,229,0.5)]"
        >
            <Icon size={24} className="text-white fill-current" />
        </motion.div>
        <div className="text-2xl font-black text-gray-900 dark:text-white tracking-widest uppercase">
            <AnimatedTitle text={text} />
        </div>
    </div>
);

const Settings = () => {
    const navigate = useNavigate();
    const fileInputRef = useRef(null);
    const [loading, setLoading] = useState(false);
    const [avatarLoading, setAvatarLoading] = useState(false);
    const [darkMode, setDarkMode] = useState(localStorage.getItem('theme') === 'dark');
    const [activeNotification, setActiveNotification] = useState(null);
    const [editingEmail, setEditingEmail] = useState(false);
    const [showPass, setShowPass] = useState(false);

    const [profile, setProfile] = useState({
        name: '', avatar_url: '', username: '', notifications: true, phone: '', docId: '' 
    });

    const [secureData, setSecureData] = useState({
        email: '', newPassword: '', currentPassword: '', newEmail: ''
    });

    useEffect(() => {
        const root = document.documentElement;
        darkMode ? root.classList.add('dark') : root.classList.remove('dark');
        localStorage.setItem('theme', darkMode ? 'dark' : 'light');
    }, [darkMode]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const currUser = await account.get();
                const res = await databases.listDocuments(DATABASE_ID, COLLECTION_ID_PROFILES, [Query.equal('user_id', currUser.$id)]);
                setSecureData(prev => ({ ...prev, email: currUser.email }));
                if (res.documents.length > 0) {
                    const doc = res.documents[0];
                    let avatarUrl = doc.avatar_url || '';
                    if (avatarUrl && !avatarUrl.includes('?') && avatarUrl.startsWith('http')) {
                        avatarUrl = `${avatarUrl}?t=${Date.now()}`;
                    }
                    setProfile({ 
                        name: doc.name || '', 
                        username: doc.username, 
                        avatar_url: avatarUrl, 
                        notifications: doc.notifications ?? true, 
                        phone: doc.phone ? formatPhoneNumber(doc.phone) : '', 
                        docId: doc.$id 
                    });
                }
            } catch (error) {
                console.error('Error fetching profile:', error);
                navigate('/auth');
             }
        };
        fetchData();
    }, [navigate]);

    useEffect(() => {
        if (!profile.docId) return;
        
        const unsubscribe = client.subscribe(
            `databases.${DATABASE_ID}.collections.${COLLECTION_ID_PROFILES}.documents.${profile.docId}`,
            (response) => {
                const { payload } = response;
                let avatarUrl = payload.avatar_url || '';
                if (avatarUrl && !avatarUrl.includes('?') && avatarUrl.startsWith('http')) {
                    avatarUrl = `${avatarUrl}?t=${Date.now()}`;
                }
                setProfile(prev => ({
                    ...prev,
                    name: payload.name || prev.name,
                    avatar_url: avatarUrl,
                    notifications: payload.notifications ?? prev.notifications,
                    phone: payload.phone ? formatPhoneNumber(payload.phone) : prev.phone
                }));
            }
        );
        
        return () => unsubscribe();
    }, [profile.docId]);

    useEffect(() => {
        if (!profile.docId) return;
        const setOnline = async () => {
            try {
                await databases.updateDocument(DATABASE_ID, COLLECTION_ID_PROFILES, profile.docId, { 
                    is_online: true, 
                    last_seen: new Date().toISOString() 
                });
            } catch (e) { console.error("Ошибка при обновлении статуса онлайн:", e);}
        };
        setOnline();
        const interval = setInterval(setOnline, 60000);
        
        const setOffline = () => {
            databases.updateDocument(DATABASE_ID, COLLECTION_ID_PROFILES, profile.docId, { 
                is_online: false, 
                last_seen: new Date().toISOString() 
            }).catch((e) => {console.error(e)});
        };
        window.addEventListener('beforeunload', setOffline);
        return () => {
            clearInterval(interval);
            window.removeEventListener('beforeunload', setOffline);
        }
    }, [profile.docId]);

    const handleLogOut = async () => {
        if (profile.docId) {
            await databases.updateDocument(DATABASE_ID, COLLECTION_ID_PROFILES, profile.docId, { 
                is_online: false, 
                last_seen: new Date().toISOString() 
            });
        }
        await account.deleteSession('current');
        navigate('/auth');
    };

    const handleAvatarChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setAvatarLoading(true);
        try {
            const uploadedFile = await storage.createFile(BUCKET_ID_AVATARS, ID.unique(), file);
            const fileUrl = storage.getFileView(BUCKET_ID_AVATARS, uploadedFile.$id);
            const fullUrl = fileUrl.href || fileUrl.toString();
            
            await databases.updateDocument(DATABASE_ID, COLLECTION_ID_PROFILES, profile.docId, { avatar_url: fullUrl });

            setProfile(prev => ({ ...prev, avatar_url: `${fullUrl}?t=${Date.now()}` }));
            
            setActiveNotification({ type: 'success', message: 'AVATAR UPDATED' });
        } catch (error) { 
            console.error('Error updating avatar:', error);
            setActiveNotification({ type: 'error', message: 'UPLOAD FAILED' }); }
        finally { setAvatarLoading(false); setTimeout(() => setActiveNotification(null), 3000); }
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await databases.updateDocument(DATABASE_ID, COLLECTION_ID_PROFILES, profile.docId, { 
                name: profile.name, 
                notifications: profile.notifications, 
                phone: profile.phone.replace(/\D/g, '')
            });
            if (editingEmail && secureData.newEmail && secureData.newEmail !== secureData.email) {
                await account.updateEmail(secureData.newEmail, secureData.currentPassword);
                setSecureData(prev => ({ ...prev, email: secureData.newEmail, newEmail: '' }));
                setEditingEmail(false);
            }
            if (secureData.newPassword) await account.updatePassword(secureData.newPassword, secureData.currentPassword);
            setActiveNotification({ type: 'success', message: 'CHANGES APPLIED' });
            setSecureData(prev => ({ ...prev, currentPassword: '', newPassword: '' }));
        } catch (error) { 
            setActiveNotification({ type: 'error', message: error.message.toUpperCase() }); 
        }
        finally { setLoading(false); setTimeout(() => setActiveNotification(null), 3000); }
    };

    return (
        <div className={`flex h-screen overflow-hidden relative transition-colors duration-500 ${darkMode ? 'dark bg-[#020617]' : 'bg-gray-100'}`}>
            <style>{`
                @keyframes gradientShift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
                .animated-bg { position: absolute; inset: 0; z-index: 0; background: ${darkMode ? 'linear-gradient(-45deg, #020617, #1e1b4b, #0f172a, #020617)' : 'linear-gradient(-45deg, #f3f4f6, #e5e7eb, #d1d5db, #f3f4f6)'}; background-size: 400% 400%; animation: gradientShift 15s ease infinite; opacity: 0.8; }
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
            <div className="animated-bg" />

            <AnimatePresence>
                {activeNotification && (
                    <motion.div initial={{ opacity: 0, y: -50 }} animate={{ opacity: 1, y: 20 }} exit={{ opacity: 0 }} className="fixed top-0 left-0 right-0 z-[100] flex justify-center pointer-events-none">
                        <div className={`backdrop-blur-xl border-4 rounded-[2rem] p-4 shadow-2xl flex items-center gap-4 max-w-sm w-full mx-4 bg-white/90 dark:bg-slate-900/90 ${activeNotification.type === 'success' ? 'border-green-500 text-green-500' : 'border-red-500 text-red-500'}`}>
                            {activeNotification.type === 'success' ? <CheckCircle size={18} /> : <ShieldAlert size={18} />}
                            <p className="text-sm font-bold uppercase tracking-widest">{activeNotification.message}</p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <motion.aside 
                initial={{ x: -100, opacity: 0 }} 
                animate={{ x: 0, opacity: 1 }} 
                className="w-96 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-r-4 border-gray-300 dark:border-slate-800 flex flex-col shadow-2xl z-20"
            >
                <div className="p-8 border-b-4 border-gray-300 dark:border-slate-800 relative overflow-hidden">
                    <div className="absolute -top-10 -right-10 opacity-[0.03] dark:opacity-[0.05] pointer-events-none">
                        <Layers size={200} />
                    </div>
                    
                    <div className="flex items-center justify-between mb-8 relative z-10">
                        <button onClick={() => navigate(-1)} className="p-2.5 bg-gray-100 dark:bg-slate-800 rounded-xl text-gray-500 hover:text-indigo-600 border-2 border-transparent hover:border-indigo-600 transition-all"><ChevronLeft size={24}/></button>
                        <SectionHeader icon={Zap} text="НАСТРОЙКИ" />
                    </div>

                    <div className="text-center relative z-10">
                        <input type="file" ref={fileInputRef} onChange={handleAvatarChange} className="hidden" accept="image/*" />
                        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => fileInputRef.current.click()} className="relative w-40 h-40 mx-auto mb-6 group cursor-pointer">
                            <div className="w-full h-full rounded-[2.5rem] border-[6px] border-indigo-600 p-1.5 shadow-2xl overflow-hidden relative bg-gray-200 dark:bg-slate-800">
                                {avatarLoading ? (
                                    <div className="w-full h-full flex items-center justify-center bg-black/20"><Loader2 className="animate-spin text-white" size={40} /></div>
                                ) : (
                                    <img 
                                        key={profile.avatar_url}
                                        src={profile.avatar_url || `https://ui-avatars.com/api/?name=${profile.name || 'User'}&background=4f46e5&color=fff&size=512`} 
                                        className="w-full h-full object-cover rounded-[2rem]" 
                                        alt="Avatar"
                                        onError={(e) => {
                                            e.target.onerror = null;
                                            e.target.src = `https://ui-avatars.com/api/?name=${profile.name || 'User'}&background=4f46e5&color=fff&size=512`;
                                        }}
                                    />
                                )}
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-[2rem]"><motion.div animate={heartBeat}><Camera className="text-white" size={28} /></motion.div></div>
                            </div>
                        </motion.div>
                        <h2 className="text-3xl font-black tracking-tighter truncate dark:text-white">{profile.name || 'User'}</h2>
                        <p className="text-indigo-600 dark:text-indigo-400 font-bold text-xs tracking-widest mt-1">@{profile.username}</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-8 space-y-6 flex flex-col no-scrollbar relative">
                    <div className="bg-gray-100 dark:bg-slate-800 p-6 rounded-[2.5rem] border-4 border-gray-200 dark:border-slate-700 flex items-center justify-between relative overflow-hidden group">
                        <div className="absolute -right-4 -bottom-4 opacity-5 pointer-events-none">
                            <Sun size={80} />
                        </div>
                        <div className="flex items-center gap-4 relative z-10">
                            <div className="text-indigo-600 dark:text-indigo-400">{darkMode ? <Moon size={20} /> : <Sun size={20} />}</div>
                            <span className="text-sm font-black uppercase tracking-widest dark:text-white">{darkMode ? 'НОЧЬ' : 'ДЕНЬ'}</span>
                        </div>
                        <div onClick={() => setDarkMode(!darkMode)} className={`relative z-10 w-14 h-8 flex items-center rounded-full p-1 cursor-pointer transition-colors ${darkMode ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-slate-600'}`}>
                            <motion.div layout className="bg-white w-6 h-6 rounded-full shadow-lg" animate={{ x: darkMode ? 24 : 0 }} />
                        </div>
                    </div>

                    <div onClick={() => setProfile({...profile, notifications: !profile.notifications})} className={`cursor-pointer p-6 rounded-[2.5rem] border-4 flex items-center justify-between transition-all relative overflow-hidden ${profile.notifications ? 'border-indigo-600 bg-indigo-600/5' : 'border-gray-300 dark:border-slate-800'}`}>
                        <div className="absolute -right-4 -bottom-4 opacity-5 pointer-events-none">
                            <Bell size={80} />
                        </div>
                        <div className="flex items-center gap-4 relative z-10">
                            <div className={`p-3 rounded-2xl ${profile.notifications ? 'bg-indigo-600 text-white shadow-lg' : 'bg-gray-200 dark:bg-slate-700 text-gray-500'}`}><motion.div animate={profile.notifications ? {rotate: [0, 15, -15, 0]} : {}}><Bell size={20} /></motion.div></div>
                            <span className="text-sm font-black uppercase tracking-widest dark:text-white">УВЕДОМЛЕНИЯ</span>
                        </div>
                        <div className={`w-12 h-7 rounded-full p-1 transition-colors relative z-10 ${profile.notifications ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-slate-700'}`}><motion.div animate={{ x: profile.notifications ? 20 : 0 }} className="w-5 h-5 bg-white rounded-full shadow-lg" /></div>
                    </div>

                    <motion.button 
                        whileHover={{ scale: 1.08, backgroundColor: 'rgba(239, 68, 68, 0.2)', boxShadow: "0px 0px 25px rgba(239, 68, 68, 0.3)", rotate: [0, -1, 1, -1, 1, 0] }}
                        whileTap={{ scale: 0.92 }}
                        onClick={handleLogOut} 
                        className="w-full p-5 rounded-[2.5rem] border-4 border-red-500/20 text-red-500 font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-3 cursor-pointer"
                    >
                        <LogOut size={18} /> <span>ВЫЙТИ</span>
                    </motion.button>

                    <div className="mt-auto p-6 border-4 border-dashed border-gray-200 dark:border-slate-800 rounded-[2.5rem] bg-white/50 dark:bg-slate-900/50 relative overflow-hidden">
                        <div className="absolute -right-2 -bottom-2 opacity-[0.03] pointer-events-none">
                            <Globe size={70} />
                        </div>
                        <div className="flex items-center gap-3 mb-3 text-indigo-600 dark:text-indigo-400 relative z-10">
                            <LockKeyhole size={18} />
                            <span className="text-xs font-black uppercase tracking-[0.2em]">Privacy Protocol</span>
                        </div>
                        <p className="text-[11px] font-bold leading-relaxed text-gray-600 dark:text-gray-300 uppercase relative z-10">Your data is strictly encrypted using military-grade standards.</p>
                    </div>
                </div>
            </motion.aside>

            <main className="flex-1 overflow-y-auto p-12 relative z-10 no-scrollbar">
                <form onSubmit={handleUpdate} className="max-w-6xl mx-auto">
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                        <div className="lg:col-span-8 space-y-10">
                            <motion.section 
                                className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-4 border-gray-300 dark:border-slate-800 rounded-[3.5rem] p-12 shadow-2xl relative overflow-hidden"
                            >
                                <div className="absolute top-0 right-0 p-8 opacity-[0.03] dark:opacity-[0.07] pointer-events-none">
                                    <Cpu size={180} />
                                </div>
                                <SectionHeader icon={User} text="ЛИЧНЫЕ ДАННЫЕ" animate={floatingHigh} />
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                                    <div className="flex flex-col">
                                        <label className="text-xs font-black text-gray-500 dark:text-slate-400 uppercase tracking-widest ml-6 mb-3 ">ОТОБРАЖАЕМОЕ ИМЯ</label>
                                        <div className="relative"><User className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400 " size={24} /><input type="text" value={profile.name} onChange={e => setProfile({...profile, name: e.target.value})} className="w-full bg-gray-100 dark:bg-slate-800 border-4 border-gray-200 dark:border-slate-700 p-6 pl-16 rounded-[2rem] font-bold text-lg dark:text-white focus:border-indigo-600 outline-none transition-all" /></div>
                                    </div>
                                    <div className="flex flex-col">
                                        <label className="text-xs font-black text-gray-500 dark:text-slate-400 uppercase tracking-widest ml-6 mb-3">ТЕЛЕФОН</label>
                                        <div className="relative"><Phone className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400" size={24} /><input type="text" value={profile.phone} onChange={e => setProfile({...profile, phone: formatPhoneNumber(e.target.value)})} placeholder="+7 (___) ___-__" className="w-full bg-gray-100 dark:bg-slate-800 border-4 border-gray-200 dark:border-slate-700 p-6 pl-16 rounded-[2rem] font-bold text-lg dark:text-white focus:border-indigo-600 outline-none transition-all" /></div>
                                    </div>
                                    <div className="md:col-span-2 flex flex-col">
                                        <div className="flex items-center justify-between ml-6 mb-3">
                                            <label className="text-xs font-black text-gray-500 dark:text-slate-400 uppercase tracking-widest">ПОЧТА</label>
                                            <button type="button" onClick={() => { setEditingEmail(!editingEmail); if(!editingEmail) setSecureData({...secureData, newEmail: secureData.email}); }} className={`text-xs font-black uppercase flex items-center gap-2 cursor-pointer ${editingEmail ? 'text-red-500' : 'text-indigo-600'}`}>{editingEmail ? <><X size={12}/> CANCEL</> : <><Pencil size={12}/> EDIT</>}</button>
                                        </div>
                                        <div className="relative"><Mail className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400" size={24} /><input type="email" value={editingEmail ? secureData.newEmail : secureData.email} onChange={e => setSecureData({...secureData, newEmail: e.target.value})} readOnly={!editingEmail} className={`w-full p-6 pl-16 rounded-[2rem] font-bold text-lg border-4 transition-all ${editingEmail ? 'bg-white dark:bg-slate-800 border-indigo-600 text-indigo-600 shadow-xl' : 'bg-gray-100/50 dark:bg-slate-800/50 border-gray-200 dark:border-slate-700 text-gray-500'}`} /></div>
                                    </div>
                                </div>
                            </motion.section>

                            <motion.section 
                                className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-4 border-gray-300 dark:border-slate-800 rounded-[3.5rem] p-12 shadow-2xl relative overflow-hidden"
                            >
                                <div className="absolute top-0 right-0 p-8 opacity-[0.03] dark:opacity-[0.07] pointer-events-none">
                                    <Shield size={180} />
                                </div>
                                <SectionHeader icon={Shield} text="БЕЗОПАСНОСТЬ" />
                                <div className="flex flex-col relative z-10">
                                    <label className="text-xs font-black text-gray-500 dark:text-slate-400 uppercase tracking-widest ml-6 mb-3">НОВЫЙ ПАРОЛЬ</label>
                                    <div className="relative"><Lock className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400" size={24}/><input type={showPass ? "text" : "password"} value={secureData.newPassword} onChange={e => setSecureData({...secureData, newPassword: e.target.value})} placeholder="••••••••••••" className="w-full bg-gray-100 dark:bg-slate-800 border-4 border-gray-200 dark:border-slate-700 p-6 pl-16 rounded-[2rem] font-bold text-lg dark:text-white focus:border-indigo-600 outline-none transition-all" /><button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-8 top-1/2 -translate-y-1/2 text-gray-400 hover:text-indigo-600">{showPass ? <EyeOff size={24}/> : <Eye size={24}/>}</button></div>
                                </div>
                            </motion.section>
                        </div>

                        <div className="lg:col-span-4 space-y-10">
                            <motion.div
                                className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-4 border-gray-300 dark:border-slate-800 rounded-[3.5rem] p-8 shadow-2xl relative overflow-hidden"
                            >
                                <div className="absolute -bottom-6 -right-6 opacity-[0.03] dark:opacity-[0.07] pointer-events-none">
                                    <Activity size={150} />
                                </div>
                                <SectionHeader icon={Activity} text="ИНФОРМАЦИЯ" />
                                <div className="space-y-6 relative z-10">
                                    <div className="flex items-center gap-4 p-5 bg-green-500/5 rounded-[2.5rem] border-4 border-green-500/20 transition-all hover:bg-green-500/10"><ShieldCheck className="text-green-500" size={24} /><div><p className="font-black text-xs uppercase dark:text-white">Active Node</p><p className="text-[10px] text-green-600 font-bold uppercase">Nominal</p></div></div>
                                    <div className="flex items-center gap-4 p-5 bg-amber-500/5 rounded-[2.5rem] border-4 border-amber-500/20 transition-all hover:bg-amber-500/10"><Fingerprint className="text-amber-500" size={24} /><div><p className="font-black text-xs uppercase dark:text-white">Secure ID</p><p className="text-[10px] text-amber-600 font-bold uppercase">Protected</p></div></div>
                                </div>
                            </motion.div>

                            <motion.div 
                                className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-[3.5rem] p-5 shadow-2xl text-white relative overflow-hidden group"
                            >
                                <div className="absolute top-0 right-0 p-4 opacity-10 rotate-12 pointer-events-none">
                                    <Zap size={100}/>
                                </div>
                                <div className="text-center mb-6 relative z-10">
                                    <motion.div animate={heartBeat} className="inline-flex p-3 rounded-2xl bg-white/10 mb-3"><Key size={24} /></motion.div>
                                    <p className="text-xs font-black uppercase tracking-[0.3em] opacity-80">ПОДТВЕРЖДЕНИЕ</p>
                                </div>
                                <input type="password" required value={secureData.currentPassword} onChange={e => setSecureData({...secureData, currentPassword: e.target.value})} placeholder="ТЕКУЩИЙ ПАРОЛЬ" className="w-full bg-white/10 border-4 border-white/20 p-6 rounded-[2rem] font-black text-white placeholder-white/30 outline-none text-lg mb-6 shadow-inner focus:bg-white/20 transition-all relative z-10 text-center" />
                                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit" disabled={loading} className="w-full bg-white text-indigo-600 py-6 rounded-[2rem] font-black uppercase tracking-widest shadow-xl flex items-center justify-center gap-4 disabled:opacity-50 relative z-10 cursor-pointer">
                                    {loading ? <Loader2 className="animate-spin" size={24}/> : <><Save size={24}/><span>СОХРАНИТЬ ИЗМЕНЕНИЯ</span></>}
                                </motion.button>
                            </motion.div>
                        </div>
                    </motion.div>
                </form>
            </main>
        </div>
    );
};

export default Settings;