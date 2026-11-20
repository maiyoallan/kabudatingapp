import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { Heart, ShieldCheck, Wifi, Users, MessageCircle, LogOut, Send, Sparkles, X, Check, Filter, UserRound, LockKeyhole, RefreshCw, Flag, Ban, ArrowLeft, Radio } from 'lucide-react';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || `${window.location.protocol}//${window.location.hostname}:4000`;
const socket = io(SERVER_URL, { autoConnect: false, transports: ['websocket', 'polling'], reconnection: true });
const pretty = value => value === 'boy' ? 'Boy' : value === 'girl' ? 'Girl' : 'Not specified';

export default function App() {
  const [gender, setGender] = useState('unspecified');
  const [me, setMe] = useState(null);
  const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState('all');
  const [incoming, setIncoming] = useState(null);
  const [outgoing, setOutgoing] = useState(false);
  const [peer, setPeer] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const [status, setStatus] = useState('disconnected');
  const [notice, setNotice] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const endRef = useRef(null);
  const typingTimer = useRef(null);

  const clearChat = useCallback((message = '') => {
    setPeer(null); setMessages([]); setDraft(''); setTyping(false); setIncoming(null); setOutgoing(false);
    if (message) setNotice(message);
  }, []);

  useEffect(() => {
    const onConnect = () => setStatus('connected');
    const onDisconnect = () => { setStatus('disconnected'); setUsers([]); clearChat('Connection lost. Rejoin when your network is available.'); setMe(null); };
    const onConnectError = error => { setStatus('error'); setNotice(error.message || 'Unable to connect to this network.'); };
    const onPresence = list => setUsers(list.filter(u => u.id !== socket.id));
    const onIncoming = request => setIncoming(request);
    const onStarted = data => { setPeer(data.peer); setMessages([]); setIncoming(null); setOutgoing(false); setNotice('You are now in a private conversation.'); };
    const onMessage = message => setMessages(prev => [...prev, message]);
    const onTyping = data => setTyping(data.typing);
    const onEnded = ({ reason }) => clearChat(reason === 'disconnected' ? 'The other person disconnected. This chat has ended.' : 'Conversation ended. Temporary messages cleared.');
    const onDeclined = data => { setOutgoing(false); setNotice(data.reason || 'Chat request declined.'); };
    const onCancelled = () => setIncoming(null);
    socket.on('connect', onConnect); socket.on('disconnect', onDisconnect); socket.on('connect_error', onConnectError);
    socket.on('presence:list', onPresence); socket.on('chat:incoming', onIncoming); socket.on('chat:started', onStarted);
    socket.on('chat:message', onMessage); socket.on('chat:typing', onTyping); socket.on('chat:ended', onEnded);
    socket.on('chat:declined', onDeclined); socket.on('chat:request-cancelled', onCancelled);
    return () => { socket.off('connect', onConnect); socket.off('disconnect', onDisconnect); socket.off('connect_error', onConnectError); socket.off('presence:list', onPresence); socket.off('chat:incoming', onIncoming); socket.off('chat:started', onStarted); socket.off('chat:message', onMessage); socket.off('chat:typing', onTyping); socket.off('chat:ended', onEnded); socket.off('chat:declined', onDeclined); socket.off('chat:request-cancelled', onCancelled); };
  }, [clearChat]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, typing]);
  useEffect(() => { if (!me || !socket.connected) return; const timer = setInterval(() => socket.emit('user:heartbeat'), 20_000); return () => clearInterval(timer); }, [me]);

  const join = () => {
    setNotice(''); setStatus('connecting');
    if (!socket.connected) socket.connect();
    const joinWhenReady = () => socket.emit('user:join', { gender }, response => {
      if (!response?.ok) { setNotice(response?.error || 'Could not join.'); return; }
      setMe(response.user); setStatus('connected'); setNotice('Welcome to KABU. You are visible to people on this network.');
    });
    if (socket.connected) joinWhenReady(); else socket.once('connect', joinWhenReady);
  };

  const requestChat = user => {
    setNotice(''); setOutgoing(true);
    socket.emit('chat:request', { targetId: user.id }, result => { if (!result?.ok) { setOutgoing(false); setNotice(result?.error || 'Could not send request.'); } else setNotice(`Chat request sent to ${user.username}.`); });
  };
  const respond = accept => { if (!incoming) return; socket.emit('chat:respond', { requestId: incoming.requestId, accept }, result => { if (!result?.ok) setNotice(result?.error || 'Request expired.'); setIncoming(null); }); };
  const send = event => { event.preventDefault(); if (!draft.trim() || !peer) return; socket.emit('chat:message', { text: draft }, result => { if (!result?.ok) setNotice(result?.error || 'Message not sent.'); }); setDraft(''); socket.emit('chat:typing', { typing: false }); };
  const onDraft = value => { setDraft(value); socket.emit('chat:typing', { typing: true }); clearTimeout(typingTimer.current); typingTimer.current = setTimeout(() => socket.emit('chat:typing', { typing: false }), 900); };
  const endChat = () => socket.emit('chat:end');
  const leave = () => { if (peer) socket.emit('chat:end'); socket.disconnect(); setMe(null); setUsers([]); clearChat(); setStatus('disconnected'); setNotice('You have left KABU.'); };
  const block = () => { if (!peer) return; socket.emit('user:block', { targetId: peer.id }, result => { setNotice(result?.ok ? 'User blocked for this session.' : result?.error); if (result?.ok) clearChat(); }); };
  const report = () => { if (!peer || !reportReason.trim()) return; socket.emit('user:report', { targetId: peer.id, reason: reportReason }, result => { setNotice(result?.ok ? 'Report received. Thank you.' : result?.error); setReportOpen(false); setReportReason(''); }); };

  const visibleUsers = useMemo(() => users.filter(user => !user.busy && (filter === 'all' || user.gender === filter)), [users, filter]);
  const onlineCount = users.filter(user => !user.busy).length;

  return <div className="app-shell">
    <div className="ambient ambient-one"/><div className="ambient ambient-two"/>
    <header className="topbar"><a className="brand" href="#home" onClick={e => e.preventDefault()}><span className="brand-mark"><Heart size={19} fill="currentColor"/></span><span>KABU<span className="brand-light">.</span><small>DATING APP</small></span></a><div className="top-right"><span className={`network-pill ${status}`}><span className="pulse-dot"/>{status === 'connected' ? 'Network connected' : status === 'connecting' ? 'Connecting' : status === 'error' ? 'Network error' : 'Not connected'}</span>{me && <button className="icon-button" onClick={leave} title="Leave KABU"><LogOut size={17}/></button>}</div></header>
    {!me ? <main className="welcome-layout" id="home"><section className="hero-copy"><div className="eyebrow"><Sparkles size={14}/> THE KABU COMMUNITY</div><h1>Meet someone.<br/><span>Make a connection.</span></h1><p className="hero-sub">A little mystery. A real connection. Discover people around you and start a conversation — anonymously.</p><div className="hero-points"><div><ShieldCheck size={17}/><span>Anonymous by design</span></div><div><Wifi size={17}/><span>Same authorized Wi-Fi</span></div><div><LockKeyhole size={17}/><span>Private one-to-one chats</span></div></div><div className="tagline">“Connect anonymously. Discover naturally.”</div></section>
      <section className="join-card"><div className="card-glow"/><div className="card-top"><div className="mini-icon"><Heart size={18} fill="currentColor"/></div><span className="private-label"><span/> PRIVATE COMMUNITY</span></div><h2>Welcome to <span>KABU</span></h2><p className="muted">Choose how you want to appear. We'll create a temporary identity for you.</p><div className="field-label">I IDENTIFY AS</div><div className="gender-options"><button className={gender === 'boy' ? 'gender-option selected' : 'gender-option'} onClick={() => setGender('boy')}><span className="gender-emoji">♂</span><span>Boy</span>{gender === 'boy' && <Check size={15}/>}</button><button className={gender === 'girl' ? 'gender-option selected' : 'gender-option'} onClick={() => setGender('girl')}><span className="gender-emoji">♀</span><span>Girl</span>{gender === 'girl' && <Check size={15}/>}</button><button className={gender === 'unspecified' ? 'gender-option selected' : 'gender-option'} onClick={() => setGender('unspecified')}><span className="gender-emoji">✦</span><span>Prefer not to say</span>{gender === 'unspecified' && <Check size={15}/>}</button></div><button className="primary-button join-button" onClick={join} disabled={status === 'connecting'}>{status === 'connecting' ? 'Connecting...' : 'Enter KABU'} <span>→</span></button><div className="privacy-note"><LockKeyhole size={13}/> No real name, email or phone number required.</div><div className="age-note">For adults 18+ only. Be respectful and protect your privacy.</div></section></main> : <main className="dashboard"><div className="dashboard-heading"><div><div className="eyebrow"><Radio size={14}/> LIVE ON YOUR NETWORK</div><h1>Discover <span>people.</span></h1><p className="muted">Find someone interesting and see where a conversation goes.</p></div><div className="online-stat"><div className="online-icon"><Users size={19}/></div><div><strong>{onlineCount}</strong><small>AVAILABLE NOW</small></div></div></div>
      {notice && <div className="notice"><Sparkles size={15}/>{notice}<button onClick={() => setNotice('')}><X size={14}/></button></div>}
      <div className="identity-strip"><div className="avatar avatar-self"><UserRound size={20}/></div><div><small>YOU ARE KNOWN AS</small><strong>{me.username}</strong></div><span className="online-tag"><i/> Online</span><button className="refresh-button" onClick={() => socket.emit('presence:get', list => setUsers(list))}><RefreshCw size={15}/> Refresh</button></div>
      <div className="discover-toolbar"><div><h2>People nearby</h2><p className="muted">Only people on this authorized network appear here.</p></div><div className="filters"><Filter size={15}/>{[['all','Everyone'],['girl','Girls'],['boy','Boys']].map(([key,label]) => <button key={key} onClick={() => setFilter(key)} className={filter === key ? 'filter active' : 'filter'}>{label}</button>)}</div></div>
      {visibleUsers.length ? <div className="people-grid">{visibleUsers.map((user,index) => <article className="person-card" key={user.id}><div className={`person-avatar avatar-${index % 5}`}><span>{user.username.slice(0,1)}</span><i/></div><div className="person-info"><h3>{user.username}</h3><p>{pretty(user.gender)} <span>·</span> <b>Online</b></p></div><button className="chat-button" onClick={() => requestChat(user)} disabled={outgoing}><MessageCircle size={16}/> Chat</button></article>)}</div> : <div className="empty-state"><div className="empty-icon"><Users size={27}/></div><h3>{users.length ? 'No one in this filter' : 'You’re early. That’s okay.'}</h3><p>{users.length ? 'Try another filter to see who is available.' : 'When other people join KABU on this network, they’ll appear here.'}</p><button className="subtle-button" onClick={() => socket.emit('presence:get', list => setUsers(list))}><RefreshCw size={14}/> Check again</button></div>}
      <div className="dashboard-foot"><ShieldCheck size={15}/> Your identity is temporary. Conversations are not saved as chat history.</div>
    </main>}
    <footer className="footer"><span>© 2026 KABU DATING APP</span><span>CONNECT ANONYMOUSLY <b>·</b> DISCOVER NATURALLY</span></footer>

    {incoming && <div className="modal-backdrop"><div className="request-modal"><button className="modal-close" onClick={() => respond(false)}><X size={17}/></button><div className="request-icon"><Heart size={24} fill="currentColor"/></div><div className="eyebrow">NEW CONNECTION</div><h2>Someone wants to<br/><span>meet you.</span></h2><p><strong>{incoming.from.username}</strong> · {pretty(incoming.from.gender)}</p><div className="modal-actions"><button className="secondary-button" onClick={() => respond(false)}>Decline</button><button className="primary-button" onClick={() => respond(true)}><Check size={16}/> Accept chat</button></div></div></div>}
    {outgoing && !peer && <div className="floating-request"><div className="spinner"/><span>Waiting for them to respond...</span><button onClick={() => { setOutgoing(false); setNotice('Request cancelled.'); }}>Cancel</button></div>}
    {peer && <div className="chat-overlay"><div className="chat-window"><div className="chat-header"><button className="back-button" onClick={endChat}><ArrowLeft size={18}/></button><div className="chat-peer-avatar">{peer.username.slice(0,1)}</div><div className="chat-peer"><strong>{peer.username}</strong><small><i/> Private conversation</small></div><button className="chat-menu" title="Block user" onClick={block}><Ban size={17}/></button><button className="chat-menu" title="Report user" onClick={() => setReportOpen(true)}><Flag size={17}/></button><button className="end-button" onClick={endChat}>End chat <X size={14}/></button></div><div className="chat-security"><LockKeyhole size={13}/> One-to-one chat · Messages disappear when this chat ends</div><div className="messages-area">{messages.length === 0 && <div className="chat-start-note"><div className="chat-start-heart"><Heart size={19}/></div><strong>You’re connected!</strong><span>Say hello to {peer.username}.</span></div>}{messages.map(message => <div key={message.id} className={message.senderId === socket.id ? 'message-row mine' : 'message-row'}><div className="message-bubble"><p>{message.text}</p><time>{new Date(message.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div></div>)}{typing && <div className="typing-indicator">{peer.username} is typing<span>•••</span></div>}<div ref={endRef}/></div><form className="message-form" onSubmit={send}><input value={draft} onChange={e => onDraft(e.target.value)} placeholder="Write a message..." maxLength={1000} autoComplete="off"/><button className="send-button" type="submit" disabled={!draft.trim()}><Send size={17}/></button></form></div></div>}
    {reportOpen && <div className="modal-backdrop"><div className="request-modal report-modal"><button className="modal-close" onClick={() => setReportOpen(false)}><X size={17}/></button><div className="eyebrow">KEEP KABU SAFE</div><h2>Report <span>user</span></h2><p className="muted">Briefly tell us why you are reporting this user. Do not include private details.</p><textarea value={reportReason} onChange={e => setReportReason(e.target.value)} placeholder="Describe the concern..." maxLength={300}/><div className="modal-actions"><button className="secondary-button" onClick={() => setReportOpen(false)}>Cancel</button><button className="primary-button" onClick={report} disabled={!reportReason.trim()}>Submit report</button></div></div></div>}
  </div>;
}
