/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useCallback } from "react";
import { account, databases, DATABASE_ID, COLLECTION_ID_PROFILES } from "../appwriteConfig";
import { ID, Query } from "appwrite";
import { useNavigate } from "react-router-dom";
import { Mail, Lock, User, AtSign, Zap, Eye, EyeOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState({ name: "", username: "", email: "", password: "", });

  const [tagStatus, setTagStatus] = useState({ loading: false, available: null, message: "",});

  const [passStatus, setPassStatus] = useState({ valid: null, message: "", strength: 0, });
  const [emailStatus, setEmailStatus] = useState({ valid: null });

  const navigate = useNavigate();

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setError(null);
    setShowPassword(false);
    setData({ name: "", username: "", email: "", password: "" });
    setTagStatus({ loading: false, available: null, message: "" });
    setPassStatus({ valid: null, message: "", strength: 0 });
    setEmailStatus({ valid: null });
  };

  useEffect(() => {
    if (!isLogin && data.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      setEmailStatus({ valid: emailRegex.test(data.email) });
    }
  }, [data.email, isLogin]);

  useEffect(() => {
    if (!isLogin && data.password) {
      const hasNumber = /\d/.test(data.password);
      const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(data.password);
      const isEnglish = !/[а-яА-Я]/.test(data.password);
      const isLongEnough = data.password.length >= 8;

      let strength = 0;
      if (data.password.length > 0) strength = 1;
      if (isLongEnough && isEnglish) strength = 2;
      if (strength >= 2 && hasNumber) strength = 3;
      if (strength === 3 && hasSpecial) strength = 4;

      if (!isEnglish)
        setPassStatus({ valid: false, message: "English only", strength: 1 });
      else if (!isLongEnough)
        setPassStatus({ valid: false, message: "Min 8 symbols", strength: 1 });
      else if (!hasNumber)
        setPassStatus({ valid: false, message: "Need number", strength: 2 });
      else if (!hasSpecial)
        setPassStatus({
          valid: false,
          message: "Need special symbol",
          strength: 3,
        });
      else
        setPassStatus({ valid: true, message: "Strong password", strength: 4 });
    } else {
      setPassStatus({ valid: null, message: "", strength: 0 });
    }
  }, [data.password, isLogin]);

  const checkUsername = useCallback(async (username) => {
    if (username.length < 4) {
      setTagStatus({ loading: false, available: false, message: "Min 4 chars" });
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setTagStatus({ loading: false, available: false, message: "Invalid symbols" });
      return;
    }
    setTagStatus({ loading: true, available: null, message: "Checking..." });
    try {
      const response = await databases.listDocuments(
        DATABASE_ID, COLLECTION_ID_PROFILES, [Query.equal("username", username.toLowerCase())]
      );
      if (response.total > 0)
        setTagStatus({ loading: false, available: false, message: "Taken" });
      else
        setTagStatus({ loading: false, available: true, message: "Available" });
    } catch {
      setTagStatus({ loading: false, available: null, message: "" });
    }
  }, []);

  useEffect(() => {
    if (!isLogin && data.username) {
      const timeoutId = setTimeout(() => checkUsername(data.username), 500);
      return () => clearTimeout(timeoutId);
    }
  }, [data.username, isLogin, checkUsername]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isLogin && (tagStatus.available === false || !passStatus.valid || emailStatus.valid === false)) {
      setError("Check requirements");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      try { await account.deleteSession("current"); } catch (error) { console.error("Ошибка при удалении сессии:", error); }
      if (isLogin) {
        await account.createEmailPasswordSession(data.email, data.password);
        navigate("/");
      } else {
        const user = await account.create(ID.unique(), data.email, data.password, data.name);
        await account.createEmailPasswordSession(data.email, data.password);

        const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(data.name)}&background=10b981&color=fff&size=512`;
        
        await databases.createDocument(
          DATABASE_ID, COLLECTION_ID_PROFILES, ID.unique(),
          {
            user_id: user.$id,
            username: data.username.toLowerCase(),
            name: data.name,
            email: data.email,
            avatar_url: avatarUrl,
            is_online: true,
            last_seen: new Date().toISOString(),
            bio: "",
            notifications: true,
            rating: 0,
            rating_count: 0,
            voted_users: []
          }
        );
        navigate("/");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = (color, isError = false) =>
    `w-full bg-slate-950/50 text-white pl-12 pr-14 py-5 rounded-xl border-2 ${isError ? "border-red-500/50" : "border-slate-800"} focus:border-${color}-500 outline-none transition-all font-mono font-black text-lg shadow-inner tracking-tight placeholder:font-sans placeholder:font-black placeholder:text-[13px] placeholder:tracking-[0.2em] placeholder:text-slate-600 placeholder:uppercase`;

  const titleVariants = {
    hidden: { y: 10, opacity: 0 },
    visible: { y: 0, opacity: 1 },
  };

  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center p-4 relative overflow-hidden text-white font-sans">
      <AnimatePresence mode="wait">
        <motion.div
          key={isLogin ? "bg-indigo" : "bg-emerald"}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className={`absolute inset-0 z-0 ${isLogin ? "bg-indigo-900/5" : "bg-emerald-900/5"}`}
        >
          <motion.div
            animate={{ scale: [1, 1.1, 1], rotate: isLogin ? [0, 5, 0] : [0, -5, 0] }}
            transition={{ duration: 15, repeat: Infinity }}
            className={`absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full blur-[120px] opacity-20 ${isLogin ? "bg-indigo-600" : "bg-emerald-600"}`}
          />
        </motion.div>
      </AnimatePresence>

      <motion.div layout className="w-full max-w-md z-10">
        <div className="bg-slate-900/80 backdrop-blur-3xl border-[2px] border-white/5 p-10 rounded-[2.5rem] shadow-[0_0_80px_rgba(0,0,0,0.6)] relative overflow-hidden transition-all duration-500">
          <AnimatePresence mode="wait">
            <motion.div key={isLogin ? "login-head" : "reg-head"} initial="hidden" animate="visible" transition={{ staggerChildren: 0.05 }} className="flex flex-col items-center mb-8">
              <motion.div
                animate={{ boxShadow: isLogin ? ["0 0 15px #6366f140", "0 0 30px #6366f180", "0 0 15px #6366f140"] : ["0 0 15px #10b98140", "0 0 30px #10b98180", "0 0 15px #10b98140"] }}
                transition={{ duration: 2, repeat: Infinity }}
                className={`p-4 rounded-xl mb-4 border-2 ${isLogin ? "bg-indigo-600 border-indigo-400" : "bg-emerald-600 border-emerald-400"}`}
              >
                <Zap className="text-white fill-current" size={24} />
              </motion.div>
              <h1 className="text-5xl font-black tracking-tighter uppercase flex">
                {"IGRO".split("").map((char, i) => (<motion.span key={i} variants={titleVariants}>{char}</motion.span>))}
                <span className={isLogin ? "text-indigo-500" : "text-emerald-500"}>
                  {"GRAM".split("").map((char, i) => (<motion.span key={i} variants={titleVariants}>{char}</motion.span>))}
                </span>
              </h1>
              <motion.div animate={{ width: ["20%", "50%", "20%"], opacity: [0.2, 0.5, 0.2] }} transition={{ duration: 3, repeat: Infinity }} className={`h-1 mt-2 rounded-full ${isLogin ? "bg-indigo-500" : "bg-emerald-500"}`} />
            </motion.div>
          </AnimatePresence>

          <form onSubmit={handleSubmit} className="space-y-6 relative">
            <AnimatePresence mode="popLayout">
              {!isLogin && (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="grid grid-cols-2 gap-4 mb-8">
                  <div className="relative group">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500/50 group-focus-within:text-emerald-500" size={20} />
                    <input type="text" value={data.name} placeholder="Name" required className={inputStyle("emerald")} onChange={(e) => setData({ ...data, name: e.target.value })} />
                  </div>
                  <div className="relative group">
                    <AtSign className={`absolute left-4 top-1/2 -translate-y-1/2 ${tagStatus.available === false ? "text-red-500" : "text-emerald-500/50"}`} size={20} />
                    <input type="text" value={data.username} placeholder="Tag" required className={inputStyle("emerald", tagStatus.available === false)} onChange={(e) => setData({ ...data, username: e.target.value })} />
                    <div className="absolute -bottom-5 left-4 h-3">
                      <AnimatePresence>
                        {tagStatus.message && (
                          <motion.span initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`text-[7px] font-black uppercase tracking-tighter block ${tagStatus.available ? "text-emerald-400" : "text-red-500"}`}>{tagStatus.message}</motion.span>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="relative group">
              <Mail className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${!isLogin && emailStatus.valid === false ? "text-red-500" : isLogin ? "text-indigo-400/50" : "text-emerald-400/50"}`} size={20} />
              <input type="email" value={data.email} placeholder="Email" required className={inputStyle(isLogin ? "indigo" : "emerald", !isLogin && emailStatus.valid === false)} onChange={(e) => setData({ ...data, email: e.target.value })} />
            </div>

            <div className="relative group">
              <Lock className={`absolute left-4 top-1/2 -translate-y-1/2 ${isLogin ? "text-indigo-400/50" : !isLogin && passStatus.valid === false ? "text-red-500" : "text-emerald-400/50"}`} size={20} />
              <input type={showPassword ? "text" : "password"} value={data.password} placeholder="Password" required className={inputStyle(isLogin ? "indigo" : "emerald", !isLogin && passStatus.valid === false)} onChange={(e) => setData({ ...data, password: e.target.value })} />
              <motion.button whileTap={{ scale: 0.8 }} type="button" onClick={() => setShowPassword(!showPassword)} className={`absolute right-4 top-1/2 -translate-y-1/2 p-1.5 rounded-lg border transition-all duration-300 ${isLogin ? "border-indigo-500/20 text-indigo-400/40 hover:text-indigo-400 hover:border-indigo-500/60 hover:bg-indigo-500/10" : "border-emerald-500/20 text-emerald-400/40 hover:text-emerald-400 hover:border-emerald-500/60 hover:bg-emerald-500/10"}`}>
                {showPassword ? <EyeOff size={18} strokeWidth={2.5} /> : <Eye size={18} strokeWidth={2.5} />}
              </motion.button>
              {!isLogin && (
                <>
                  <div className="absolute -bottom-1 left-4 right-4 h-[2px] bg-slate-800 rounded-full overflow-hidden">
                    <motion.div animate={{ width: `${(passStatus.strength / 4) * 100}%` }} className="h-full bg-emerald-500 shadow-[0_0_10px_#10b981]" />
                  </div>
                  <div className="absolute -bottom-5 left-4 h-3">
                    <AnimatePresence>
                      {data.password && (
                        <motion.span initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`text-[7px] font-black uppercase tracking-tighter block ${passStatus.valid ? "text-emerald-400" : "text-red-400"}`}>{passStatus.message}</motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                </>
              )}
            </div>

            <div className="h-4 flex items-center justify-center">
              <AnimatePresence>
                {error && (
                  <motion.p initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="text-red-400 text-[9px] font-black uppercase text-center bg-red-500/10 px-3 py-1 rounded-lg border border-red-500/20 w-full">{error}</motion.p>
                )}
              </AnimatePresence>
            </div>

            <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} className={`w-full py-5 rounded-xl font-black text-lg uppercase tracking-[0.2em] border-b-[6px] transition-all active:border-b-[2px] shadow-xl ${isLogin ? "bg-indigo-600 border-indigo-900 text-white" : "bg-emerald-600 border-emerald-900 text-white"}`}>
              {loading ? "..." : isLogin ? "Sign In" : "Create Account"}
            </motion.button>
          </form>

          <div className="mt-8 text-center">
            <button onClick={toggleMode} className={`font-black uppercase tracking-[0.2em] text-[12px] pb-1 border-b-2 transition-all ${isLogin ? "text-slate-500 border-transparent hover:text-indigo-400 hover:border-indigo-400" : "text-slate-500 border-transparent hover:text-emerald-400 hover:border-emerald-400"}`}>
              {isLogin ? "Dont have account? Register" : "Already registered? Sign In"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default Auth;