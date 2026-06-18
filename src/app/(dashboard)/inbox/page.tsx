'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { Send, Loader2, MessageSquare, Search, Users, ArrowLeft } from 'lucide-react'
import { Input } from '@/components/ui/input'
import type { Message } from '@/types'

interface Conversation {
  partnerId:   string
  partnerName: string
  partnerRole: string
  messages:    Message[]
  lastMessage: Message
}

const ROLE_LABELS: Record<string, string> = {
  video_maker: 'Video Maker',
  designer:    'Designer',
  ai_video:    'AI Video',
  media_buyer: 'Media Buyer',
}

const ROLE_COLORS: Record<string, string> = {
  video_maker: 'bg-purple-500/20 text-purple-400',
  designer:    'bg-pink-500/20 text-pink-400',
  ai_video:    'bg-cyan-500/20 text-cyan-400',
  media_buyer: 'bg-orange-500/20 text-orange-400',
}

export default function InboxPage() {
  const [myId,          setMyId]          = useState<string | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [members,       setMembers]       = useState<{ id: string; display_name?: string; role: string }[]>([])
  const [selected,      setSelected]      = useState<string | null>(null)
  const [newMsg,        setNewMsg]        = useState('')
  const [sending,       setSending]       = useState(false)
  const [loading,       setLoading]       = useState(true)
  const [search,        setSearch]        = useState('')
  // On mobile: show 'list' or 'chat' panel
  const [mobileView,   setMobileView]    = useState<'list' | 'chat'>('list')
  const bottomRef = useRef<HTMLDivElement>(null)

  const buildConversations = useCallback((
    allMessages: Message[],
    meId: string,
    memberList: { id: string; display_name?: string; role: string }[],
  ) => {
    const memberMap = Object.fromEntries(memberList.map(m => [m.id, m]))
    const byPartner: Record<string, Message[]> = {}
    for (const msg of allMessages) {
      const partnerId = msg.sender_id === meId ? msg.receiver_id : msg.sender_id
      if (!byPartner[partnerId]) byPartner[partnerId] = []
      byPartner[partnerId].push(msg)
    }
    const convs: Conversation[] = Object.entries(byPartner)
      .map(([partnerId, msgs]) => {
        const member = memberMap[partnerId]
        return {
          partnerId,
          partnerName: member?.display_name ?? partnerId,
          partnerRole: member?.role ?? '',
          messages:    msgs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
          lastMessage: msgs[msgs.length - 1],
        }
      })
      .sort((a, b) => new Date(b.lastMessage.created_at).getTime() - new Date(a.lastMessage.created_at).getTime())
    setConversations(convs)
    return convs
  }, [])

  useEffect(() => {
    async function load() {
      const [profileRes, msgsRes, membersRes] = await Promise.all([
        fetch('/api/profile'),
        fetch('/api/messages'),
        fetch('/api/team-users'),
      ])
      const profile  = await profileRes.json()
      const msgs     = await msgsRes.json()
      const mList    = await membersRes.json()

      setMyId(profile.id)
      setMembers(Array.isArray(mList) ? mList : [])
      const convs = buildConversations(Array.isArray(msgs) ? msgs : [], profile.id, Array.isArray(mList) ? mList : [])

      if (convs.length > 0 && !selected) setSelected(convs[0].partnerId)
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [selected, conversations])

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!newMsg.trim() || !selected || !myId) return
    setSending(true)
    const res = await fetch('/api/messages', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ receiver_id: selected, content: newMsg.trim() }),
    })
    if (res.ok) {
      const msg: Message = await res.json()
      setConversations(prev => prev.map(c =>
        c.partnerId === selected
          ? { ...c, messages: [...c.messages, msg], lastMessage: msg }
          : c
      ).sort((a, b) => new Date(b.lastMessage.created_at).getTime() - new Date(a.lastMessage.created_at).getTime()))
      setNewMsg('')
    }
    setSending(false)
  }

  function selectConversation(partnerId: string) {
    setSelected(partnerId)
    setMobileView('chat')
  }

  const membersWithoutConvo = members.filter(m => !conversations.find(c => c.partnerId === m.id))

  const filteredConvos = conversations.filter(c =>
    c.partnerName.toLowerCase().includes(search.toLowerCase())
  )
  const filteredNew = membersWithoutConvo.filter(m =>
    (m.display_name ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const activeConvo  = conversations.find(c => c.partnerId === selected)
  const activeMember = members.find(m => m.id === selected)
  const activeName   = activeConvo?.partnerName ?? activeMember?.display_name ?? selected ?? ''
  const activeRole   = activeConvo?.partnerRole ?? activeMember?.role ?? ''

  function formatTime(iso: string) {
    const d = new Date(iso)
    const now = new Date()
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  // ── Contact list panel ──────────────────────────────────────────────────────
  const ContactList = (
    <div className={`
      flex flex-col border-r border-slate-800 bg-slate-900
      md:w-72 md:shrink-0
      ${mobileView === 'list' ? 'flex w-full' : 'hidden md:flex'}
    `}>
      <div className="p-4 border-b border-slate-800">
        <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2 mb-3">
          <MessageSquare className="h-4 w-4 text-indigo-400" /> Team Inbox
        </h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <Input
            className="pl-8 h-8 text-xs bg-slate-800 border-slate-700"
            placeholder="Search members…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-20">
            <Loader2 className="h-5 w-5 animate-spin text-slate-600" />
          </div>
        ) : (
          <>
            {filteredConvos.map(c => (
              <button
                key={c.partnerId}
                onClick={() => selectConversation(c.partnerId)}
                className={`w-full text-left px-4 py-3 border-b border-slate-800/60 hover:bg-slate-800/50 transition-colors ${
                  selected === c.partnerId ? 'bg-indigo-600/10 border-l-2 border-l-indigo-500' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
                    {c.partnerName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-200 truncate">{c.partnerName}</span>
                      <span className="text-[10px] text-slate-500 shrink-0 ml-2">{formatTime(c.lastMessage.created_at)}</span>
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{c.lastMessage.content}</p>
                  </div>
                </div>
              </button>
            ))}

            {filteredNew.length > 0 && (
              <>
                <div className="px-4 py-2 text-[10px] text-slate-600 uppercase font-semibold tracking-wider flex items-center gap-1.5">
                  <Users className="h-3 w-3" /> No messages yet
                </div>
                {filteredNew.map(m => (
                  <button
                    key={m.id}
                    onClick={() => selectConversation(m.id)}
                    className={`w-full text-left px-4 py-3 border-b border-slate-800/60 hover:bg-slate-800/50 transition-colors ${
                      selected === m.id ? 'bg-indigo-600/10 border-l-2 border-l-indigo-500' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-slate-400 font-bold text-xs shrink-0">
                        {(m.display_name ?? '?').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <span className="text-sm font-medium text-slate-400">{m.display_name ?? m.id}</span>
                        <p className="text-[10px] text-slate-600 mt-0.5">{ROLE_LABELS[m.role] ?? m.role}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </>
            )}

            {filteredConvos.length === 0 && filteredNew.length === 0 && (
              <div className="text-center py-10 text-slate-600 text-sm">No team members yet</div>
            )}
          </>
        )}
      </div>
    </div>
  )

  // ── Chat panel ──────────────────────────────────────────────────────────────
  const ChatPanel = (
    <div className={`
      flex-1 flex flex-col
      ${mobileView === 'chat' ? 'flex w-full' : 'hidden md:flex'}
    `}>
      {selected ? (
        <>
          {/* Header */}
          <div className="px-4 py-3.5 border-b border-slate-800 flex items-center gap-3 shrink-0">
            {/* Back button — mobile only */}
            <button
              onClick={() => setMobileView('list')}
              className="md:hidden p-1 -ml-1 text-slate-400 hover:text-slate-100"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
              {activeName.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-200">{activeName}</p>
              {activeRole && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${ROLE_COLORS[activeRole] ?? 'bg-slate-700 text-slate-400'}`}>
                  {ROLE_LABELS[activeRole] ?? activeRole}
                </span>
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-3">
            {!activeConvo || activeConvo.messages.length === 0 ? (
              <div className="text-center py-12 text-slate-600 text-sm">No messages yet. Say hello! 👋</div>
            ) : (
              activeConvo.messages.map(msg => {
                const isMe = msg.sender_id === myId
                return (
                  <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] md:max-w-[70%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      isMe
                        ? 'bg-indigo-600 text-white rounded-br-sm'
                        : 'bg-slate-800 text-slate-100 rounded-bl-sm'
                    }`}>
                      {msg.content}
                      <p className="text-[10px] opacity-60 mt-1 text-right">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form onSubmit={sendMessage} className="p-3 md:p-4 border-t border-slate-800 flex gap-2 shrink-0">
            <input
              value={newMsg}
              onChange={e => setNewMsg(e.target.value)}
              placeholder={`Message ${activeName}…`}
              className="flex-1 bg-slate-800 text-slate-100 rounded-xl px-4 py-2.5 text-sm outline-none placeholder:text-slate-500 border border-slate-700 focus:border-indigo-500 transition-colors"
            />
            <button
              type="submit"
              disabled={sending || !newMsg.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl px-4 py-2.5 transition-colors"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">
          <div className="text-center space-y-2">
            <MessageSquare className="h-10 w-10 mx-auto opacity-20" />
            <p>Select a team member to view messages</p>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-0 rounded-2xl overflow-hidden border border-slate-800 bg-slate-900">
      {ContactList}
      {ChatPanel}
    </div>
  )
}
