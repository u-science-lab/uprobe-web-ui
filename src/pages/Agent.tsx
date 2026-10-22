import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Avatar,
  IconButton,
  useTheme,
  useMediaQuery,
  CircularProgress,
  Fade,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Snackbar,
  InputAdornment,
  Chip,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  alpha,
} from '@mui/material';
import {
  Send,
  SmartToy,
  Person,
  Attachment,
  RestartAlt,
  Lightbulb,
  Science,
  AutoAwesome,
  Code,
  ContentCopy,
  Add,
  Delete,
  Settings,
  InsertDriveFile,
  Close,
  Download,
  Edit,
  Refresh,
  Search,
  FileDownload,
  MenuOpen,
  ChevronLeft,
  OpenInNew,
} from '@mui/icons-material';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import ApiService, { API_BASE_URL } from '../api';
import { formatApiError } from '../utils/apiErrorMessage';
import { getToken } from '../utils';

type AgentProcessEntry = {
  id: string;
  kind: 'agent_message' | 'tool_call' | 'file' | 'command' | 'status';
  agent: string;
  title: string;
  body?: string;
  tools?: string[];
  status?: 'running' | 'done' | 'error';
  timestamp: string;
};

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'assistant';
  timestamp: Date;
  type?: 'text' | 'code' | 'result';
  thinking?: string[];
  attachments?: { id: string; filename: string; url: string; mime_type: string; size: number }[];
  activityLog?: AgentProcessEntry[];
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  sessionId?: string;
  attachments?: { id: string; filename: string; url: string; mime_type: string; size: number }[];
  tags?: string[];
}

interface SuggestedPrompt {
  title: string;
  prompt: string;
  icon: React.ReactElement;
  category: string;
}

interface DownloadableArtifact {
  label: string;
  type: string;
  path: string;
}

interface ArtifactPreviewState {
  open: boolean;
  loading: boolean;
  artifact?: DownloadableArtifact;
  text?: string;
  rows?: string[][];
  imageUrl?: string;
  truncated?: boolean;
}

const friendlyToolName = (tool: string): string => {
  const raw = String(tool || '').replace(/^.*?__/, '').replace(/_/g, ' ').trim();
  if (!raw) return 'Tool';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

const processKindForTools = (tools: string[]): AgentProcessEntry['kind'] => {
  const joined = tools.join(' ').toLowerCase();
  if (joined.includes('shell') || joined.includes('run_command')) return 'command';
  if (joined.includes('file') || joined.includes('read') || joined.includes('write')) return 'file';
  return 'tool_call';
};

const normalizeActivityEntry = (entry: any, index: number): AgentProcessEntry | null => {
  if (!entry) return null;
  if (['agent_message', 'tool_call', 'file', 'command', 'status'].includes(entry.kind)) {
    return {
      id: String(entry.id || `process-${index}`),
      kind: entry.kind,
      agent: String(entry.agent || 'Agent'),
      title: String(entry.title || entry.agent || 'Agent step'),
      body: entry.body ? String(entry.body) : undefined,
      tools: Array.isArray(entry.tools) ? entry.tools.map(String) : undefined,
      status: entry.status || 'done',
      timestamp: entry.timestamp || new Date().toISOString(),
    };
  }
  if (entry.kind === 'tool') {
    const tools = Array.isArray(entry.tools) ? entry.tools.map(String) : [];
    return {
      id: `tool-${index}-${tools.join('-')}`,
      kind: processKindForTools(tools),
      agent: String(entry.agent || 'Agent'),
      title: tools.length ? tools.map(friendlyToolName).join(', ') : 'Used tool',
      tools,
      status: 'done',
      timestamp: new Date().toISOString(),
    };
  }
  if (entry.kind === 'delta') {
    const text = String(entry.text || '').trim();
    if (!text) return null;
    return {
      id: `delta-${index}`,
      kind: 'agent_message',
      agent: String(entry.agent || 'Agent'),
      title: 'Updated reasoning',
      body: text,
      status: 'done',
      timestamp: new Date().toISOString(),
    };
  }
  return null;
};

const normalizeActivityLog = (entries: any[] | undefined): AgentProcessEntry[] => (
  Array.isArray(entries)
    ? entries.map((entry, index) => normalizeActivityEntry(entry, index)).filter((entry): entry is AgentProcessEntry => Boolean(entry))
    : []
);

const hydrateMessage = (message: any): Message => ({
  ...message,
  timestamp: new Date(message.timestamp),
  attachments: message.attachments || [],
  thinking: message.thinking || [],
  activityLog: normalizeActivityLog(message.activityLog),
});

const hydrateConversation = (conversation: any): Conversation => ({
  ...conversation,
  createdAt: new Date(conversation.createdAt),
  updatedAt: new Date(conversation.updatedAt),
  messages: Array.isArray(conversation.messages)
    ? conversation.messages.map((message: any) => hydrateMessage(message))
    : [],
  attachments: conversation.attachments || [],
  tags: conversation.tags || [],
});

const cleanConfigValue = (value: string) => {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && ((trimmed[0] === '"' && trimmed[trimmed.length - 1] === '"') || (trimmed[0] === "'" && trimmed[trimmed.length - 1] === "'"))) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
};

const isValidProxy = (value: string) => {
  const cleaned = cleanConfigValue(value);
  if (!cleaned) return true;
  try {
    const parsed = new URL(cleaned);
    return ['http:', 'https:'].includes(parsed.protocol) && Boolean(parsed.host);
  } catch {
    return false;
  }
};

/** User cancelled, axios abort, or browser/network timeout — backend may still be running until /stop. */
const isAbortLikeError = (error: unknown): boolean => {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (axios.isAxiosError(error)) {
    const code = error.code;
    if (code === 'ERR_CANCELED' || code === 'ECONNABORTED') return true;
  }
  return false;
};

const Agent: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const REQUEST_TIMEOUT_MS = 600000;  // 10 minutes
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  
  // Session and API key management (HTTP-based)
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [tempApiKey, setTempApiKey] = useState('');
  const [model, setModel] = useState('');
  const [tempModel, setTempModel] = useState('');
  const [proxy, setProxy] = useState('');
  const [tempProxy, setTempProxy] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' as 'success' | 'error' | 'info' | 'warning' });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isReplaying, setIsReplaying] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [editConversationTitle, setEditConversationTitle] = useState('');
  const [artifactPreview, setArtifactPreview] = useState<ArtifactPreviewState>({ open: false, loading: false });

  const hasAgentConfiguration = Boolean(apiKey.trim() && model.trim()) && isValidProxy(proxy);

  const openApiKeyDialog = useCallback(() => {
    setTempApiKey(apiKey);
    setTempModel(model);
    setTempProxy(proxy);
    setShowApiKeyDialog(true);
  }, [apiKey, model, proxy]);

  const closeApiKeyDialog = useCallback(() => {
    setTempApiKey(apiKey);
    setTempModel(model);
    setTempProxy(proxy);
    setShowApiKeyDialog(false);
  }, [apiKey, model, proxy]);


  const refreshConversation = useCallback(async (conversationId: string) => {
    const conversation = await ApiService.getAgentConversation(conversationId);
    const hydrated = hydrateConversation(conversation);
    setConversations(prev => {
      const remaining = prev.filter(conv => conv.id !== conversationId);
      return [hydrated, ...remaining];
    });
    return hydrated;
  }, []);

  /** Stop pantheon chat on the server when the UI gave up (error/abort), then sync session id. */
  const haltBackendAgentAfterUiFailure = useCallback(
    async (convId: string | null | undefined) => {
      if (!convId) return;
      try {
        await ApiService.stopAgentConversation(convId);
      } catch (e) {
        console.warn('haltBackendAgentAfterUiFailure (stop):', e);
      }
      try {
        const refreshed = await refreshConversation(convId);
        setSessionId(refreshed.sessionId ?? null);
      } catch (e) {
        console.warn('haltBackendAgentAfterUiFailure (refresh):', e);
      }
    },
    [refreshConversation],
  );

  const loadConversations = useCallback(async () => {
    const remoteConversations = await ApiService.listAgentConversations();
    const hydrated = remoteConversations.map((conversation: any) =>
      hydrateConversation(conversation)
    );
    setConversations(hydrated);
    return hydrated;
  }, []);

  // Load browser-local agent config and conversations on component mount.
  useEffect(() => {
    const savedApiKey = localStorage.getItem('uprobe-agent-api-key');
    const savedModel = localStorage.getItem('uprobe-agent-model');
    const savedProxy = localStorage.getItem('uprobe-agent-proxy');
    const lastConversationId = localStorage.getItem('agent-current-conversation-id');
    if (savedApiKey) {
      setApiKey(savedApiKey);
      setTempApiKey(savedApiKey);
    }
    if (savedModel) {
      setModel(savedModel);
      setTempModel(savedModel);
    }
    if (savedProxy) {
      const cleanedProxy = cleanConfigValue(savedProxy);
      setProxy(cleanedProxy);
      setTempProxy(cleanedProxy);
    }
    void loadConversations()
      .then((loaded) => {
        if (lastConversationId && loaded.some((conv: Conversation) => conv.id === lastConversationId)) {
          setCurrentConversationId(lastConversationId);
          return;
        }
        if (loaded.length > 0) {
          setCurrentConversationId(loaded[0].id);
        }
      })
      .catch((error) => {
        console.error('Failed to load conversations:', error);
        setSnackbar({ open: true, message: formatApiError(error), severity: 'error' });
      });
  }, [loadConversations]);

  // Load current conversation messages
  useEffect(() => {
    if (currentConversationId) {
      localStorage.setItem('agent-current-conversation-id', currentConversationId);
      const conversation = conversations.find(c => c.id === currentConversationId);
      setMessages(conversation?.messages || []);
      setSessionId(conversation?.sessionId || null);
      const shouldRefresh =
        !conversation ||
        (
          conversation.messages.length === 0 &&
          Number((conversation as any).messageCount || 0) > 0
        );
      if (shouldRefresh) {
        void refreshConversation(currentConversationId)
          .then((loaded) => {
            setMessages(loaded.messages || []);
            setSessionId(loaded.sessionId || null);
          })
          .catch((error) => {
            console.error('Failed to load conversation:', error);
            setSnackbar({ open: true, message: formatApiError(error), severity: 'error' });
            setMessages([]);
            setSessionId(null);
          });
      }
    } else {
      setMessages([]);
      setSessionId(null);
    }
  }, [currentConversationId, conversations, refreshConversation]);

  // Get current conversation attachments
  const currentAttachments = conversations.find(c => c.id === currentConversationId)?.attachments || [];

  const suggestedPrompts: SuggestedPrompt[] = [
    {
      title: 'Design FISH Probes',
      prompt: 'I want to design FISH probes for my target genes. Please help me create a design strategy.',
      icon: <Science />,
      category: 'Probe Design'
    },
    {
      title: 'Optimize Parameters',
      prompt: 'Please help me analyze and optimize probe Tm values, GC content, and specificity parameters.',
      icon: <AutoAwesome />,
      category: 'Optimization'
    },
    {
      title: 'Batch Processing',
      prompt: 'I have multiple target sequences. How do I set up a batch probe design workflow?',
      icon: <Code />,
      category: 'Batch Process'
    },
    {
      title: 'Result Analysis',
      prompt: 'Please explain the meaning of various indicators in probe design results and quality assessment.',
      icon: <Lightbulb />,
      category: 'Analysis'
    }
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Conversation/session management
  const ensureConversationId = async (conversationId?: string | null) => {
    if (conversationId) {
      return conversationId;
    }
    try {
      const created = hydrateConversation(
        await ApiService.createAgentConversation('New Conversation')
      );
      setConversations(prev => [created, ...prev.filter(conv => conv.id !== created.id)]);
      setCurrentConversationId(created.id);
      return created.id;
    } catch (error) {
      console.error('Failed to create conversation:', error);
      setSnackbar({ open: true, message: formatApiError(error), severity: 'error' });
      return null;
    }
  };

  const stopSession = async () => {
    if (!currentConversationId) return;
    try {
      await ApiService.stopAgentConversation(currentConversationId);
      const updated = await refreshConversation(currentConversationId);
      setSessionId(updated.sessionId || null);
      setSnackbar({ open: true, message: 'Agent session stopped', severity: 'info' });
    } catch (error) {
      console.error('Failed to stop session:', error);
      setSnackbar({ open: true, message: formatApiError(error), severity: 'error' });
    }
  };

  const createNewConversation = async () => {
    try {
      const created = hydrateConversation(
        await ApiService.createAgentConversation('New Conversation')
      );
      setConversations(prev => [created, ...prev.filter(conv => conv.id !== created.id)]);
      setCurrentConversationId(created.id);
    } catch (error) {
      console.error('Failed to create conversation:', error);
      setSnackbar({ open: true, message: formatApiError(error), severity: 'error' });
    }
  };

  const deleteConversation = async (conversationId: string) => {
    try {
      await ApiService.deleteAgentConversation(conversationId);
      const remaining = conversations.filter(c => c.id !== conversationId);
      setConversations(remaining);
      if (currentConversationId === conversationId) {
        setCurrentConversationId(remaining[0]?.id || null);
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      setSnackbar({ open: true, message: formatApiError(error), severity: 'error' });
    }
  };

  const handleEditConversationStart = (e: React.MouseEvent, conversation: Conversation) => {
    e.stopPropagation();
    setEditingConversationId(conversation.id);
    setEditConversationTitle(conversation.title);
  };

  const handleEditConversationSave = async (e?: React.KeyboardEvent | React.FocusEvent | React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (editingConversationId && editConversationTitle.trim()) {
      try {
        const updated = hydrateConversation(
          await ApiService.renameAgentConversation(
            editingConversationId,
            editConversationTitle.trim()
          )
        );
        setConversations(prev => prev.map(conv =>
          conv.id === editingConversationId ? { ...conv, title: updated.title } : conv
        ));
      } catch (error) {
        console.error('Failed to rename conversation:', error);
        setSnackbar({ open: true, message: formatApiError(error), severity: 'error' });
      }
    }
    setEditingConversationId(null);
  };

  const getUserTurnIndex = (messageId: string) => {
    let userIndex = -1;
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.sender === 'user') userIndex += 1;
      if (msg.id === messageId) return userIndex;
    }
    return -1;
  };

  const handleEditStart = (message: Message) => {
    if (isLoading) return;
    setEditingMessageId(message.id);
    setEditValue(message.content);
  };

  const handleEditCancel = () => {
    setEditingMessageId(null);
    setEditValue('');
  };

  const handleEditSave = async (message: Message) => {
    if (!hasAgentConfiguration) {
      openApiKeyDialog();
      setSnackbar({ open: true, message: 'Please configure Agent model and API key first', severity: 'warning' });
      return;
    }
    if (isLoading) return;
    const newContent = editValue.trim();
    if (!newContent) {
      setSnackbar({ open: true, message: 'Content cannot be empty', severity: 'warning' });
      return;
    }
    if (!currentConversationId) {
      setSnackbar({ open: true, message: 'No conversation selected', severity: 'warning' });
      return;
    }

    const userTurnIndex = getUserTurnIndex(message.id);
    if (userTurnIndex < 0) {
      setSnackbar({ open: true, message: 'Cannot locate this message', severity: 'error' });
      return;
    }
    // Close edit mode immediately
    setEditingMessageId(null);
    setEditValue('');
    
    setIsLoading(true);
    setIsReplaying(true);
    const attachmentIds = (message.attachments || []).map(a => a.id);
    const pendingAssistantId = `pending-${Date.now().toString()}-${Math.random().toString(36).slice(2)}`;
    const pendingAssistantMessage: Message = {
      id: pendingAssistantId,
      content: '',
      thinking: [],
      sender: 'assistant',
      timestamp: new Date(),
      type: 'text',
      activityLog: [],
    };
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      // Optimistically truncate history after the edited user message
      setConversations(prev => prev.map(conv => {
        if (conv.id === currentConversationId) {
          const msgIndex = conv.messages.findIndex(m => m.id === message.id);
          if (msgIndex === -1) return conv;
          const updatedUser = { ...conv.messages[msgIndex], content: newContent };
          const truncated = [...conv.messages.slice(0, msgIndex), updatedUser];
          return { ...conv, messages: [...truncated, pendingAssistantMessage], updatedAt: new Date() };
        }
        return conv;
      }));

      // Create and store AbortController
      const controller = new AbortController();
      abortControllerRef.current = controller;
      timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const streamedActivity: AgentProcessEntry[] = [];
      const appendActivity = (entry: AgentProcessEntry) => {
        streamedActivity.push(entry);
        setConversations(prev => prev.map(conv => {
          if (conv.id !== currentConversationId) return conv;
          return {
            ...conv,
            messages: conv.messages.map(m =>
              m.id === pendingAssistantId
                ? { ...m, activityLog: [...(m.activityLog || []), entry] }
                : m
            ),
          };
        }));
      };

      const data = await ApiService.streamAgentRewind(currentConversationId, {
        user_turn_index: userTurnIndex,
        content: newContent,
        attachment_ids: attachmentIds,
        api_key: apiKey.trim() || undefined,
        model: model.trim() || undefined,
        proxy: cleanConfigValue(proxy) || undefined,
      }, controller.signal, (evt) => {
        if (evt.event === 'delta') {
          const entry = normalizeActivityEntry({ kind: 'delta', agent: evt.agent, text: evt.text }, streamedActivity.length);
          if (entry) appendActivity(entry);
        } else if (evt.event === 'tool') {
          const entry = normalizeActivityEntry({ kind: 'tool', agent: evt.agent, tools: evt.tools }, streamedActivity.length);
          if (entry) appendActivity(entry);
        }
      });
      clearTimeout(timeoutId);
      timeoutId = undefined;
      abortControllerRef.current = null;
      const persistedActivity = normalizeActivityLog(data.process);
      const finalActivity = persistedActivity.length > 0 ? persistedActivity : streamedActivity;
      const assistantMessage: Message = {
        id: `${Date.now().toString()}-${Math.random()}`,
        content: data.message || '',
        thinking: Array.isArray(data.thinking) ? data.thinking : [],
        sender: 'assistant',
        timestamp: new Date(),
        type: 'text',
        activityLog: finalActivity,
      };
      // Replace pending assistant message with the real response
      setConversations(prev => prev.map(conv => {
        if (conv.id === currentConversationId) {
          return {
            ...conv,
            messages: conv.messages.map(m => (m.id === pendingAssistantId ? assistantMessage : m)),
            updatedAt: new Date()
          };
        }
        return conv;
      }));
      const refreshed = await refreshConversation(currentConversationId);
      setMessages(refreshed.messages);
      setSessionId(refreshed.sessionId || null);
    } catch (error) {
      await haltBackendAgentAfterUiFailure(currentConversationId);
      if (isAbortLikeError(error)) {
        setSnackbar({ open: true, message: 'Request cancelled', severity: 'warning' });
        // Don't remove the pending message if cancelled, maybe allow retry? 
        // For now let's just leave it or remove it based on preference. 
        // Removing pending message on cancel:
        setConversations(prev => prev.map(conv => {
          if (conv.id === currentConversationId) {
            return { ...conv, messages: conv.messages.filter(m => m.id !== pendingAssistantId), updatedAt: new Date() };
          }
          return conv;
        }));
      } else {
        console.error('Failed to rewind message:', error);
        setSnackbar({ open: true, message: formatApiError(error), severity: 'error' });
        // Remove pending message on failure
        setConversations(prev => prev.map(conv => {
          if (conv.id === currentConversationId) {
            return { ...conv, messages: conv.messages.filter(m => m.id !== pendingAssistantId), updatedAt: new Date() };
          }
          return conv;
        }));
      }
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      abortControllerRef.current = null;
      setIsLoading(false);
      setIsReplaying(false);
    }
  };

  const handleSendMessage = async () => {
    if (!hasAgentConfiguration) {
      openApiKeyDialog();
      setSnackbar({ open: true, message: 'Please configure Agent model and API key first', severity: 'warning' });
      return;
    }
    if (!inputValue.trim() || isLoading) return;

    // Create new conversation if none exists
    const conversationId = await ensureConversationId(currentConversationId);
    if (!conversationId) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputValue.trim(),
      sender: 'user',
      timestamp: new Date(),
      type: 'text',
      attachments: currentAttachments.length > 0 ? [...currentAttachments] : undefined
    };

    const pendingAssistantId = `pending-${Date.now().toString()}-${Math.random().toString(36).slice(2)}`;

    // Update conversation with user message and streaming assistant placeholder
    setConversations(prev => prev.map(conv => {
      if (conv.id === conversationId) {
        const updatedMessages = [
          ...conv.messages,
          userMessage,
          {
            id: pendingAssistantId,
            content: '',
            sender: 'assistant' as const,
            timestamp: new Date(),
            type: 'text' as const,
            activityLog: [],
          },
        ];
        // Update title if this is the first user message
        const title = conv.messages.length === 0 ?
          userMessage.content.slice(0, 50) + (userMessage.content.length > 50 ? '...' : '') :
          conv.title;
        return { ...conv, messages: updatedMessages, title, updatedAt: new Date() };
      }
      return conv;
    }));

    setInputValue('');
    setIsLoading(true);
    
    // Collect attachment ids for this conversation
    const conv = conversations.find(c => c.id === conversationId);
    const attachmentIds = (conv?.attachments || []).map(a => a.id);

    // Clear attachments from conversation after collecting ids
    setConversations(prev => prev.map(c => {
      if (c.id === conversationId) {
        return { ...c, attachments: [] };
      }
      return c;
    }));

    // Stream assistant reply (SSE)
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const streamedActivity: AgentProcessEntry[] = [];
      const appendActivity = (entry: AgentProcessEntry) => {
        streamedActivity.push(entry);
        setConversations(prev => prev.map(c => {
          if (c.id !== conversationId) return c;
          return {
            ...c,
            messages: c.messages.map(m =>
              m.id === pendingAssistantId
                ? { ...m, activityLog: [...(m.activityLog || []), entry] }
                : m
            ),
          };
        }));
      };

      const data = await ApiService.streamAgentMessage(conversationId, {
        content: userMessage.content,
        attachment_ids: attachmentIds,
        api_key: apiKey.trim() || undefined,
        model: model.trim() || undefined,
        proxy: cleanConfigValue(proxy) || undefined,
      }, controller.signal, (evt) => {
        if (evt.event === 'delta') {
          const entry = normalizeActivityEntry({ kind: 'delta', agent: evt.agent, text: evt.text }, streamedActivity.length);
          if (entry) appendActivity(entry);
        } else if (evt.event === 'tool') {
          const entry = normalizeActivityEntry({ kind: 'tool', agent: evt.agent, tools: evt.tools }, streamedActivity.length);
          if (entry) appendActivity(entry);
        }
      });
      clearTimeout(timeoutId);
      timeoutId = undefined;
      abortControllerRef.current = null;
      const persistedActivity = normalizeActivityLog(data.process);
      const finalActivity = persistedActivity.length > 0 ? persistedActivity : streamedActivity;

      const assistantMessage: Message = {
        id: `${Date.now().toString()}-${Math.random()}`,
        content: data.message || '',
        thinking: Array.isArray(data.thinking) ? data.thinking : [],
        sender: 'assistant',
        timestamp: new Date(),
        type: 'text',
        activityLog: finalActivity,
      };

      setConversations(prev => prev.map(conv => {
        if (conv.id === conversationId) {
          return {
            ...conv,
            messages: conv.messages.map(m => (m.id === pendingAssistantId ? assistantMessage : m)),
            updatedAt: new Date(),
          };
        }
        return conv;
      }));
      const refreshed = await refreshConversation(conversationId);
      setMessages(refreshed.messages);
      setSessionId(refreshed.sessionId || null);
    } catch (error) {
      await haltBackendAgentAfterUiFailure(conversationId);
      setConversations(prev => prev.map(conv => {
        if (conv.id === conversationId) {
          return { ...conv, messages: conv.messages.filter(m => m.id !== pendingAssistantId), updatedAt: new Date() };
        }
        return conv;
      }));
      if (isAbortLikeError(error)) {
        setSnackbar({ open: true, message: 'Request cancelled', severity: 'warning' });
      } else {
        console.error('Failed to send message:', error);
        setSnackbar({ open: true, message: formatApiError(error), severity: 'error' });
      }
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  };

  const handleChooseFiles = () => {
    if (!hasAgentConfiguration) {
      openApiKeyDialog();
      setSnackbar({ open: true, message: 'Please configure Agent model and API key first', severity: 'warning' });
      return;
    }
    if (isLoading) return;

    // Ensure a conversation exists before selecting files
    void ensureConversationId(currentConversationId).then((convId) => {
      if (!convId) return;
      fileInputRef.current?.click();
    });
  };

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    if (!hasAgentConfiguration) {
      openApiKeyDialog();
      setSnackbar({ open: true, message: 'Please configure Agent model and API key first', severity: 'warning' });
      e.target.value = '';
      return;
    }
    // Ensure conversation id
    const convId = await ensureConversationId(currentConversationId);
    if (!convId) return;

    for (const file of Array.from(files) as File[]) {
      const fileId = `${Date.now()}-${Math.random()}`;
      setUploadProgress(prev => ({ ...prev, [fileId]: 0 }));
      // const form = new FormData();
      try {
        setUploadProgress(prev => ({ ...prev, [fileId]: 50 }));
        const data = await ApiService.uploadAgentAttachment(convId, file, {
          api_key: apiKey.trim() || undefined,
          model: model.trim() || undefined,
          proxy: cleanConfigValue(proxy) || undefined,
        });
        const targetId = convId;
        setUploadProgress(prev => ({ ...prev, [fileId]: 100 }));
        setConversations(prev => prev.map(conv => {
          if (conv.id === targetId) {
            const atts = conv.attachments || [];
            return { ...conv, attachments: [...atts, data], updatedAt: new Date() };
          }
          return conv;
        }));
        setTimeout(() => {
          setUploadProgress(prev => {
            const updated = { ...prev };
            delete updated[fileId];
            return updated;
          });
        }, 1000);
        setSnackbar({ open: true, message: `Uploaded ${file.name}`, severity: 'success' });
        const refreshed = await refreshConversation(convId);
        setMessages(refreshed.messages);
        setSessionId(refreshed.sessionId || null);
      } catch (err) {
        setUploadProgress(prev => {
          const updated = { ...prev };
          delete updated[fileId];
          return updated;
        });
        setSnackbar({ open: true, message: `${file.name}: ${formatApiError(err)}`, severity: 'error' });
      }
    }
    // reset input
    e.target.value = '';
  };

  const handleRemoveAttachment = async (attachmentId: string) => {
    if (!currentConversationId) return;
    try {
      await ApiService.deleteAgentAttachment(currentConversationId, attachmentId);
      const convId = currentConversationId;
      const refreshed = await refreshConversation(convId);
      setMessages(refreshed.messages);
      setSessionId(refreshed.sessionId || null);
    } catch (e) {
      setSnackbar({ open: true, message: formatApiError(e), severity: 'error' });
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  const handleSuggestedPrompt = (prompt: string) => {
    if (!hasAgentConfiguration) {
      openApiKeyDialog();
      setSnackbar({ open: true, message: 'Please configure Agent model and API key first', severity: 'warning' });
      return;
    }
    setInputValue(prompt);
    inputRef.current?.focus();
  };

  const handleCancelRequest = async () => {
    if (!abortControllerRef.current) return;
    
    // Abort the ongoing request
    abortControllerRef.current.abort();
    abortControllerRef.current = null;
    setIsLoading(false);
    setIsReplaying(false);
    
    setSnackbar({ open: true, message: 'Request cancelled', severity: 'info' });

    if (currentConversationId) {
      try {
        await ApiService.stopAgentConversation(currentConversationId);
        const refreshed = await refreshConversation(currentConversationId);
        setSessionId(refreshed.sessionId || null);
      } catch (e) {
        console.error('Failed to stop session on cancel:', e);
        setSnackbar({ open: true, message: formatApiError(e), severity: 'warning' });
      }
    }
  };

  const extractDownloadableArtifacts = (content: string): DownloadableArtifact[] => {
    const lines = (content || '').split('\n');
    const artifacts: DownloadableArtifact[] = [];
    let inArtifacts = false;
    let current: Partial<DownloadableArtifact> | null = null;

    const flush = () => {
      if (current?.label && current?.type && current?.path && current.path !== '<absolute_path_or_null>') {
        artifacts.push({
          label: current.label,
          type: current.type,
          path: current.path,
        });
      }
      current = null;
    };

    for (const line of lines) {
      if (/^\s*downloadable_artifacts\s*:/.test(line)) {
        inArtifacts = true;
        continue;
      }
      if (!inArtifacts) continue;
      if (/^\S/.test(line) && !/^\s*-\s+/.test(line)) {
        break;
      }

      const itemMatch = line.match(/^\s*-\s+label\s*:\s*(.+)$/);
      if (itemMatch) {
        flush();
        current = { label: itemMatch[1].trim().replace(/^['"]|['"]$/g, '') };
        continue;
      }
      if (!current) continue;
      const fieldMatch = line.match(/^\s*(type|path)\s*:\s*(.+)$/);
      if (fieldMatch) {
        const key = fieldMatch[1] as 'type' | 'path';
        const value = fieldMatch[2].trim().replace(/^['"]|['"]$/g, '');
        if (value && value !== 'null' && !value.endsWith('_or_null>')) {
          current[key] = value;
        }
      }
    }
    flush();
    return artifacts;
  };

  const buildArtifactUrl = (artifactPath: string): string => {
    if (!currentConversationId) return '#';
    const rel = normalizeAgentRunsRelativePath(artifactPath);
    let tail: string;
    if (rel) {
      tail = rel;
    } else {
      const norm = artifactPath.trim().replace(/\\/g, '/');
      const looksAbs = norm.startsWith('/') || /^[a-zA-Z]:\//i.test(norm);
      if (looksAbs) {
        tail = norm.split('/').filter(Boolean).pop() || norm;
      } else {
        tail = norm.split('/').filter(Boolean).join('/') || norm;
      }
    }
    const encoded = tail.split('/').map(encodeURIComponent).join('/');
    return `/agent/conversations/${currentConversationId}/files/${encoded}`;
  };

  const apiPublicHref = (path: string): string => {
    if (/^https?:\/\//i.test(path)) return path;
    const base = API_BASE_URL.replace(/\/$/, '');
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${base}${p}`;
  };

  const fetchAuthenticatedArtifactBlob = async (absoluteUrl: string): Promise<Blob> => {
    const token = getToken();
    const headers: HeadersInit = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(absoluteUrl, { headers, credentials: 'same-origin' });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const j = (await res.json()) as { detail?: unknown };
        if (j.detail != null) detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail);
      } catch {
        try {
          const t = await res.text();
          if (t) detail = t.slice(0, 400);
        } catch {
          /* ignore */
        }
      }
      throw new Error(detail);
    }
    return res.blob();
  };

  const triggerAuthenticatedArtifactDownload = async (absoluteUrl: string, filename: string) => {
    try {
      const blob = await fetchAuthenticatedArtifactBlob(absoluteUrl);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setSnackbar({ open: true, message: formatApiError(e), severity: 'error' });
    }
  };

  const triggerAuthenticatedArtifactOpen = async (absoluteUrl: string) => {
    try {
      const blob = await fetchAuthenticatedArtifactBlob(absoluteUrl);
      const url = URL.createObjectURL(blob);
      const w = window.open(url, '_blank', 'noopener,noreferrer');
      if (!w) {
        URL.revokeObjectURL(url);
        setSnackbar({ open: true, message: 'Popup blocked — allow popups or use Download', severity: 'warning' });
        return;
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 180_000);
    } catch (e) {
      setSnackbar({ open: true, message: formatApiError(e), severity: 'error' });
    }
  };

  const openArtifactPreview = async (artifact: DownloadableArtifact) => {
    const fileHref = apiPublicHref(buildArtifactUrl(artifact.path));
    setArtifactPreview({ open: true, loading: true, artifact });
    try {
      const blob = await fetchAuthenticatedArtifactBlob(fileHref);
      const type = artifact.type.toLowerCase();
      if (isImageArtifact(type) || isImageArtifact(artifact.path)) {
        const imageUrl = URL.createObjectURL(blob);
        setArtifactPreview({ open: true, loading: false, artifact, imageUrl });
        return;
      }
      const fullText = await blob.text();
      const limit = 256 * 1024;
      const truncated = fullText.length > limit;
      const text = truncated ? fullText.slice(0, limit) : fullText;
      setArtifactPreview({
        open: true,
        loading: false,
        artifact,
        text,
        rows: type === 'csv' ? parseCsvPreview(text) : undefined,
        truncated,
      });
    } catch (e) {
      setArtifactPreview({ open: false, loading: false });
      setSnackbar({ open: true, message: formatApiError(e), severity: 'error' });
    }
  };

  const closeArtifactPreview = () => {
    if (artifactPreview.imageUrl) URL.revokeObjectURL(artifactPreview.imageUrl);
    setArtifactPreview({ open: false, loading: false });
  };

  const normalizeAgentRunsRelativePath = (artifactPath: string): string | null => {
    let raw = artifactPath.trim();
    try {
      raw = decodeURIComponent(raw);
    } catch {
      /* keep raw */
    }
    let normalized = raw.replace(/^file:\/\//i, '').replace(/\\/g, '/').trim();
    // Windows paths: "C:/x" → "/C:/x" for stable segment handling
    if (/^[a-zA-Z]:\//.test(normalized)) {
      normalized = `/${normalized}`;
    }
    const idx = normalized.indexOf('/agent_runs/');
    if (idx >= 0) return normalized.slice(idx + 1).replace(/^\/+/, '');
    if (/^agent_runs\//i.test(normalized)) return normalized.replace(/^\/+/, '');
    // .../users/<key>/<conversation>/relative (API output layout)
    const usersConv = normalized.match(/\/users\/[^/]+\/[^/]+\/(.+)$/);
    if (usersConv?.[1] && !usersConv[1].includes('..')) {
      return usersConv[1].replace(/^\/+/, '');
    }
    const outOrResults = normalized.match(/\/(?:outputs|results)\/(.+)$/i);
    if (outOrResults?.[1] && !outOrResults[1].includes('..')) {
      const rest = outOrResults[1].replace(/^\/+/, '');
      const peeled = rest.replace(/^users\/[^/]+\/[^/]+\//i, '');
      if (/agent_runs\//i.test(peeled) || /\.(?:yaml|yml|csv|html|htm|log|txt|json|png|jpg|jpeg|svg)$/i.test(peeled)) {
        return peeled;
      }
    }
    // Run dir missing "agent_runs" segment: YYYYMMDD_slug/protocols/foo.yaml
    const runSlug = normalized.match(
      /(?:^|[\\/])\d{8}_[^\s\\/]+\/[^\s]+\.(?:yaml|yml|csv|html|htm|log|txt|json|png|jpg|jpeg|svg)$/i,
    );
    if (runSlug && !runSlug[0].includes('..')) {
      return `agent_runs/${runSlug[0].replace(/^[\\/]+/, '')}`;
    }
    return null;
  };

  /** Collapse whitespace/newlines inside markdown link targets like ](file:///...\n  ...). */
  const flattenMarkdownFileLinks = (text: string): string =>
    text.replace(/(\]\(\s*)(file:\/\/[\s\S]*?)\)/gi, (_, prefix: string, inner: string) => {
      const collapsed = inner.replace(/\s+/g, '');
      return `${prefix}${collapsed})`;
    });

  /** Undo soft line-breaks inside filesystem paths (model/UI often splits ".c" and "sv"). */
  const joinBrokenAgentRunsPaths = (text: string): string => {
    const lines = text.split('\n');
    const out: string[] = [];
    const completeArtifactExt = /\.(?:yaml|yml|csv|html|htm|log|txt|json|png|jpe?g|svg)(?:\s*)$/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const leadingMatch = line.match(/^(\s*)/);
      const lead = leadingMatch ? leadingMatch[1] : '';
      let body = line.trimEnd();

      while (i + 1 < lines.length) {
        if (!body.includes('/agent_runs/')) break;
        if (completeArtifactExt.test(body)) break;

        const nextTrim = lines[i + 1].trim();
        if (!nextTrim) break;
        if (!/^[\w.-]+$/.test(nextTrim)) break;
        if (nextTrim.length > 48) break;

        body += nextTrim;
        i++;
      }
      out.push(lead + body);
    }
    return out.join('\n');
  };

  const stripFileSchemeForPathScan = (href: string): string => {
    let h = href.trim();
    try {
      h = decodeURIComponent(h);
    } catch {
      /* keep raw */
    }
    if (/^file:/i.test(h)) {
      h = h.replace(/^file:\/\//i, '');
      if (/^[a-zA-Z]:/.test(h)) return h.replace(/\\/g, '/');
      if (!h.startsWith('/')) h = `/${h}`;
    }
    return h.replace(/\\/g, '/');
  };

  const inferArtifactType = (p: string): string => {
    const ext = (p.split('.').pop() || '').toLowerCase();
    const map: Record<string, string> = {
      yaml: 'yaml',
      yml: 'yaml',
      csv: 'csv',
      html: 'html',
      htm: 'html',
      log: 'log',
      txt: 'txt',
      json: 'json',
      png: 'image',
      jpg: 'image',
      jpeg: 'image',
      svg: 'image',
    };
    return map[ext] || ext || 'file';
  };

  const isImageArtifact = (typeOrPath: string) => /\.(png|jpe?g|svg)$/i.test(typeOrPath) || /^(png|jpe?g|svg|image)$/i.test(typeOrPath);

  const isUserVisibleArtifact = (artifact: DownloadableArtifact): boolean => {
    const t = artifact.type.toLowerCase();
    const p = artifact.path.toLowerCase();
    return t !== 'log' && !p.endsWith('.log');
  };

  const isPreviewableArtifact = (artifact: DownloadableArtifact): boolean => {
    const t = artifact.type.toLowerCase();
    return ['csv', 'yaml', 'yml', 'json', 'txt'].includes(t) || isImageArtifact(t) || isImageArtifact(artifact.path);
  };

  const artifactTitle = (artifact: DownloadableArtifact): string => {
    const label = artifact.label.trim();
    const t = artifact.type.toLowerCase();
    if (label && !/\.(csv|html?|ya?ml|json|txt|log|png|jpe?g|svg)$/i.test(label)) return label;
    const path = artifact.path.toLowerCase();
    if (t === 'csv' && /panel_analysis|marker|cluster|cell/.test(`${label} ${path}`)) return 'Analysis table';
    if (t === 'csv') return 'Probe table';
    if (t === 'html' || t === 'htm') return 'HTML report';
    if (t === 'yaml' || t === 'yml') return 'Protocol YAML';
    if (t === 'json') return 'JSON data';
    if (t === 'log') return 'Run log';
    if (isImageArtifact(t) || isImageArtifact(artifact.path)) {
      if (/umap/.test(`${label} ${path}`)) return 'UMAP figure';
      if (/dotplot/.test(`${label} ${path}`)) return 'Dot plot';
      if (/heatmap/.test(`${label} ${path}`)) return 'Heatmap';
      return 'Analysis figure';
    }
    return 'Generated file';
  };

  const artifactTypeLabel = (artifact: DownloadableArtifact): string => {
    const t = artifact.type.toLowerCase();
    if (t === 'html' || t === 'htm') return 'Report';
    if (t === 'csv') return 'CSV';
    if (t === 'yaml' || t === 'yml') return 'YAML';
    if (t === 'log') return 'Log';
    if (isImageArtifact(t) || isImageArtifact(artifact.path)) return 'Figure';
    return t.toUpperCase() || 'File';
  };

  const artifactAccent = (artifact: DownloadableArtifact) => {
    const t = artifact.type.toLowerCase();
    if (t === 'csv') return theme.palette.success.main;
    if (t === 'html' || t === 'htm') return theme.palette.primary.main;
    if (t === 'yaml' || t === 'yml' || t === 'json') return theme.palette.warning.main;
    if (t === 'log' || t === 'txt') return theme.palette.info.main;
    if (isImageArtifact(t) || isImageArtifact(artifact.path)) return theme.palette.secondary.main;
    return theme.palette.secondary.main;
  };

  const parseCsvPreview = (text: string, maxRows = 100): string[][] => {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      const next = text[i + 1];
      if (quoted) {
        if (ch === '"' && next === '"') {
          cell += '"';
          i += 1;
        } else if (ch === '"') {
          quoted = false;
        } else {
          cell += ch;
        }
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === ',') {
        row.push(cell);
        cell = '';
      } else if (ch === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
        if (rows.length >= maxRows) break;
      } else if (ch !== '\r') {
        cell += ch;
      }
    }
    if (rows.length < maxRows && (cell || row.length)) {
      row.push(cell);
      rows.push(row);
    }
    return rows;
  };

  const humanLabelFromArtifactPath = (absPath: string): string => {
    const base = absPath.replace(/\\/g, '/').split('/').pop() || absPath;
    return base.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');
  };

  const artifactDedupeKey = (path: string): string =>
    normalizeAgentRunsRelativePath(path) || path;

  const scanAgentRunsPathsInText = (content: string): string[] => {
    const found = new Set<string>();
    const re = /(?:\/[\w.-]+)+\/agent_runs\/[\w./-]+\.(?:yaml|yml|csv|html|htm|txt|json|png|jpe?g|svg)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      found.add(m[0]);
    }
    return [...found];
  };

  const scanMarkdownArtifactLinks = (content: string): { label: string; path: string }[] => {
    const out: { label: string; path: string }[] = [];
    const re = /\[([^\]]+)\]\(([^)]+)\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const hrefClean = stripFileSchemeForPathScan(m[2]);
      const inner = hrefClean.match(
        /(?:\/[\w.-]+)+\/agent_runs\/[\w./-]+\.(?:yaml|yml|csv|html|htm|txt|json|png|jpe?g|svg)/i,
      );
      if (inner) out.push({ label: m[1].trim(), path: inner[0] });
    }
    return out;
  };

  const collectOutputArtifacts = (content: string): DownloadableArtifact[] => {
    const byKey = new Map<string, DownloadableArtifact>();
    for (const a of extractDownloadableArtifacts(content)) {
      byKey.set(artifactDedupeKey(a.path), { ...a });
    }
    for (const p of scanAgentRunsPathsInText(content)) {
      const k = artifactDedupeKey(p);
      if (!k || byKey.has(k)) continue;
      byKey.set(k, {
        label: humanLabelFromArtifactPath(p),
        type: inferArtifactType(p),
        path: p,
      });
    }
    for (const { label, path } of scanMarkdownArtifactLinks(content)) {
      const k = artifactDedupeKey(path);
      if (!k) continue;
      const existing = byKey.get(k);
      if (existing) {
        if (label && label.length > 0 && label.length < 120) existing.label = label;
      } else {
        byKey.set(k, {
          label: label || humanLabelFromArtifactPath(path),
          type: inferArtifactType(path),
          path,
        });
      }
    }
    return [...byKey.values()].filter(isUserVisibleArtifact);
  };

  /** Hide YAML duplicate of downloadable_artifacts (buttons panel replaces it). */
  const stripDownloadableArtifactsSection = (raw: string): string => {
    const withoutArtifactCodeBlocks = raw
      .replace(/```[\w-]*\n[\s\S]*?downloadable_artifacts\s*:[\s\S]*?```/gi, '')
      .replace(/```[\w-]*\n\s*```/g, '');
    const lines = withoutArtifactCodeBlocks.split('\n');
    const out: string[] = [];
    let skipping = false;
    for (const line of lines) {
      if (/^\s*downloadable_artifacts\s*:/.test(line)) {
        skipping = true;
        continue;
      }
      if (skipping) {
        if (/^\s*-\s+label\s*:/.test(line)) continue;
        if (/^\s+(type|path)\s*:/.test(line)) continue;
        if (/^\s*$/.test(line)) continue;
        skipping = false;
      }
      out.push(line);
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  };

  const preprocessArtifactCodeBlocksForDisplay = (content: string): string =>
    content.replace(/```[\w]*\n([\s\S]*?)```/g, (full, inner: string) => {
      const t = inner.trim().replace(/\\/g, '/');
      if (
        !inner.includes('\n') &&
        t.includes('/agent_runs/') &&
        /\.(?:yaml|yml|csv|html|htm|log|txt|json|png|jpe?g|svg)$/i.test(t)
      ) {
        return '';
      }
      const lines = inner.split(/\n/).map((l) => l.trim().replace(/\\/g, '/')).filter(Boolean);
      if (
        lines.length > 0 &&
        lines.every(
          (l) =>
            l.includes('/agent_runs/') &&
            /\.(?:yaml|yml|csv|html|htm|log|txt|json|png|jpe?g|svg)$/i.test(l),
        )
      ) {
        return '';
      }
      return full;
    });

  const scrubArtifactPathsForDisplay = (raw: string, artifacts: DownloadableArtifact[]): string => {
    let s = raw;
    const uniqPaths = [...new Set(artifacts.map((a) => a.path))];
    const artifactNames = new Set(
      artifacts
        .flatMap((a) => [a.path.replace(/\\/g, '/').split('/').pop() || '', a.label])
        .filter(Boolean)
        .map((x) => x.toLowerCase()),
    );
    for (const p of uniqPaths) {
      if (!p || p.length < 12) continue;
      const fname = p.replace(/\\/g, '/').split('/').pop() || p;
      const quoted = `"${fname}"`;
      s = s.split(p).join(quoted);
      const escParen = p.replace(/[()]/g, '\\$&');
      s = s.replace(new RegExp(`\\[[^\\]]*\\]\\(${escParen}\\)`, 'g'), quoted);
    }
    const lines = s.split('\n');
    const out: string[] = [];
    let inOutputSection = false;
    const fileExt = /\.(?:csv|html?|ya?ml|json|txt|log|png|jpe?g|svg)(?:["'`)]|\s|$)/i;
    const isArtifactLine = (line: string) => {
      const t = line.trim().toLowerCase();
      if (!t) return true;
      if (/^\s*[-*]\s*\[[^\]]+\]\([^)]*(?:agent_runs|\/files\/)[^)]*\)\s*$/i.test(line)) return true;
      if (/^\s*[-*]?\s*(csv|html?|ya?ml|json|txt|log|report|output)\s*:\s*/i.test(line) && fileExt.test(line)) return true;
      if (fileExt.test(line) && [...artifactNames].some((name) => name && t.includes(name))) return true;
      return false;
    };
    const isSectionHeading = (line: string) => {
      const t = line.trim();
      return Boolean(t && !/^[-*]\s+/.test(t) && /^#{1,4}\s+/.test(t) || /^[A-Z][\w\s]{1,40}:?$/.test(t));
    };
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^(?:#{0,4}\s*)?(?:\*\*)?\s*(output|outputs|artifacts|generated files)\s*:?\s*(?:\*\*)?\s*$/i.test(trimmed)) {
        inOutputSection = artifacts.length > 0;
        if (!inOutputSection) out.push(line);
        continue;
      }
      if (inOutputSection) {
        if (isArtifactLine(line)) continue;
        if (isSectionHeading(line)) {
          inOutputSection = false;
          out.push(line);
          continue;
        }
        out.push(line);
        continue;
      }
      if (artifacts.length > 0 && isArtifactLine(line)) continue;
      out.push(line);
    }
    s = out.join('\n').replace(/\n{3,}/g, '\n\n');
    return s.trim();
  };

  const renderOutputArtifactsPanel = (artifacts: DownloadableArtifact[]) => {
    if (artifacts.length === 0 || !currentConversationId) return null;
    const shortFileName = (p: string) => p.replace(/\\/g, '/').split('/').pop() || p;
    const groupLabel = (artifact: DownloadableArtifact) => {
      const t = artifact.type.toLowerCase();
      if (t === 'csv') return 'Tables';
      if (isImageArtifact(t) || isImageArtifact(artifact.path)) return 'Figures';
      if (t === 'html' || t === 'htm') return 'Reports';
      if (t === 'log' || t === 'txt') return 'Logs';
      return 'Files';
    };
    const groupCounts = artifacts.reduce<Record<string, number>>((acc, artifact) => {
      const key = groupLabel(artifact);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return (
      <Box sx={{ mb: 1.35 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.55, mb: 0.75, flexWrap: 'wrap' }}>
          <Typography variant="caption" sx={{ fontWeight: 750, color: 'text.primary', letterSpacing: 0.2 }}>
            Generated files
          </Typography>
          <Chip
            label={artifacts.length}
            size="small"
            variant="outlined"
            sx={{ height: 18, minWidth: 22, fontSize: '0.65rem', fontWeight: 700 }}
          />
          {Object.entries(groupCounts).map(([label, count]) => (
            <Chip
              key={label}
              label={`${count} ${label}`}
              size="small"
              sx={{
                display: { xs: artifacts.length > 2 ? 'none' : 'inline-flex', sm: 'inline-flex' },
                height: 18,
                fontSize: '0.62rem',
                color: 'text.secondary',
                bgcolor: 'transparent',
                border: '1px solid',
                borderColor: 'divider',
              }}
            />
          ))}
        </Box>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 0.55,
          }}
        >
          {artifacts.map((artifact, idx) => {
            const fileHref = apiPublicHref(buildArtifactUrl(artifact.path));
            const fname = shortFileName(artifact.path);
            const typeLabel = artifactTypeLabel(artifact);
            const title = artifactTitle(artifact);
            const accent = artifactAccent(artifact);
            const previewable = isPreviewableArtifact(artifact);
            const isHtml = ['html', 'htm'].includes(artifact.type.toLowerCase());
            return (
              <Paper
                key={`${artifactDedupeKey(artifact.path)}-${idx}`}
                variant="outlined"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.9,
                  px: 1,
                  py: 0.65,
                  borderRadius: 1.75,
                  bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.022)' : 'rgba(15,23,42,0.018)',
                  transition: 'border-color 0.15s ease, background-color 0.15s ease',
                  '&:hover': {
                    borderColor: accent,
                    bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.72)',
                  },
                }}
              >
                <Box
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: 1.25,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: accent,
                    bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'background.paper',
                    border: '1px solid',
                    borderColor: 'divider',
                    flex: '0 0 auto',
                  }}
                >
                  {isHtml ? (
                    <OpenInNew sx={{ fontSize: 16 }} />
                  ) : isImageArtifact(artifact.type) || isImageArtifact(artifact.path) ? (
                    <AutoAwesome sx={{ fontSize: 16 }} />
                  ) : artifact.type.toLowerCase() === 'csv' ? (
                    <Science sx={{ fontSize: 16 }} />
                  ) : (
                    <InsertDriveFile sx={{ fontSize: 16 }} />
                  )}
                </Box>
                <Box sx={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', gap: 0.8 }}>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary', minWidth: 0, lineHeight: 1.25 }}>
                      {title}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        display: 'block',
                        color: 'text.secondary',
                        fontFamily: 'ui-monospace, Menlo, monospace',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        lineHeight: 1.25,
                      }}
                      title={fname}
                    >
                      {fname}
                    </Typography>
                  </Box>
                  <Chip
                    label={typeLabel}
                    size="small"
                    sx={{
                      display: { xs: 'none', sm: 'inline-flex' },
                      height: 20,
                      fontSize: '0.65rem',
                      color: accent,
                      bgcolor: 'transparent',
                      border: '1px solid',
                      borderColor: accent,
                      fontWeight: 700,
                    }}
                  />
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.35, flex: '0 0 auto' }}>
                    {previewable ? (
                      <Tooltip title="Preview">
                        <IconButton
                          aria-label={`Preview ${fname}`}
                          size="small"
                          sx={{
                            width: 30,
                            height: 30,
                            border: '1px solid',
                            borderColor: 'divider',
                            bgcolor: 'background.paper',
                            color: 'text.secondary',
                            '&:hover': { color: accent, borderColor: accent },
                          }}
                          onClick={() => void openArtifactPreview(artifact)}
                        >
                          <Search sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    ) : null}
                    {isHtml ? (
                      <Tooltip title="Open report">
                        <IconButton
                          aria-label={`Open ${fname}`}
                          size="small"
                          sx={{
                            width: 30,
                            height: 30,
                            border: '1px solid',
                            borderColor: 'divider',
                            bgcolor: 'background.paper',
                            color: 'text.secondary',
                            '&:hover': { color: accent, borderColor: accent },
                          }}
                          onClick={() => void triggerAuthenticatedArtifactOpen(fileHref)}
                        >
                          <OpenInNew sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    ) : null}
                    <Tooltip title="Download">
                      <IconButton
                        aria-label={`Download ${fname}`}
                        size="small"
                        sx={{
                          width: 30,
                          height: 30,
                          border: '1px solid',
                          borderColor: 'divider',
                          bgcolor: 'background.paper',
                          color: 'text.secondary',
                          '&:hover': { color: accent, borderColor: accent },
                        }}
                        onClick={() => void triggerAuthenticatedArtifactDownload(fileHref, fname)}
                      >
                        <FileDownload sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  {(artifact.type.toLowerCase() === 'yaml' || artifact.type.toLowerCase() === 'yml' || artifact.type.toLowerCase() === 'json' || artifact.type.toLowerCase() === 'txt' || artifact.type.toLowerCase() === 'log') ? (
                    <Tooltip title="Copy content">
                      <IconButton
                        aria-label={`Copy ${fname}`}
                        size="small"
                        sx={{
                          width: 30,
                          height: 30,
                          border: '1px solid',
                          borderColor: 'divider',
                          bgcolor: 'background.paper',
                          color: 'text.secondary',
                          '&:hover': { color: accent, borderColor: accent },
                        }}
                        onClick={async () => {
                          const blob = await fetchAuthenticatedArtifactBlob(fileHref);
                          await navigator.clipboard?.writeText(await blob.text());
                        }}
                      >
                        <ContentCopy sx={{ fontSize: 15 }} />
                      </IconButton>
                    </Tooltip>
                  ) : null}
                  </Box>
                </Box>
              </Paper>
            );
          })}
        </Box>
      </Box>
    );
  };

  const handleClearChat = async () => {
    if (!currentConversationId) return;
    
    // Cancel ongoing request if any
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    try {
      await ApiService.clearAgentConversation(currentConversationId);
      const refreshed = await refreshConversation(currentConversationId);
      setMessages(refreshed.messages);
      setSessionId(refreshed.sessionId || null);
    } catch (error) {
      console.error('Failed to clear conversation:', error);
      setSnackbar({ open: true, message: formatApiError(error), severity: 'error' });
      return;
    }
    
    setIsLoading(false);
    setSnackbar({ open: true, message: 'Chat cleared and session stopped', severity: 'info' });
  };
  const handleRegenerateMessage = async (messageId: string) => {
    if (!hasAgentConfiguration) {
      openApiKeyDialog();
      setSnackbar({ open: true, message: 'Please configure Agent model and API key first', severity: 'warning' });
      return;
    }
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1 || messageIndex === 0) return;
    const previousMessage = messages[messageIndex - 1];
    if (previousMessage.sender !== 'user') return;
    
    if (!currentConversationId) {
      setSnackbar({ open: true, message: 'No conversation selected', severity: 'warning' });
      return;
    }
    
    const userTurnIndex = getUserTurnIndex(previousMessage.id);
    if (userTurnIndex < 0) return;
    setIsLoading(true);
    setIsReplaying(true);
    const attachmentIds = (previousMessage.attachments || []).map(a => a.id);
    const pendingAssistantId = `pending-${Date.now().toString()}-${Math.random().toString(36).slice(2)}`;
    const pendingAssistantMessage: Message = {
      id: pendingAssistantId,
      content: '',
      thinking: [],
      sender: 'assistant',
      timestamp: new Date(),
      type: 'text',
      activityLog: [],
    };
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      // Optimistically truncate from the assistant message being regenerated and append a pending placeholder
      setConversations(prev => prev.map(conv => {
        if (conv.id === currentConversationId) {
          const truncated = conv.messages.slice(0, messageIndex);
          return { ...conv, messages: [...truncated, pendingAssistantMessage], updatedAt: new Date() };
        }
        return conv;
      }));

      // Create and store AbortController
      const controller = new AbortController();
      abortControllerRef.current = controller;
      timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const streamedActivity: AgentProcessEntry[] = [];
      const appendActivity = (entry: AgentProcessEntry) => {
        streamedActivity.push(entry);
        setConversations(prev => prev.map(conv => {
          if (conv.id !== currentConversationId) return conv;
          return {
            ...conv,
            messages: conv.messages.map(m =>
              m.id === pendingAssistantId
                ? { ...m, activityLog: [...(m.activityLog || []), entry] }
                : m
            ),
          };
        }));
      };

      const data = await ApiService.streamAgentRewind(currentConversationId, {
        user_turn_index: userTurnIndex,
        content: previousMessage.content,
        attachment_ids: attachmentIds,
        api_key: apiKey.trim() || undefined,
        model: model.trim() || undefined,
        proxy: cleanConfigValue(proxy) || undefined,
      }, controller.signal, (evt) => {
        if (evt.event === 'delta') {
          const entry = normalizeActivityEntry({ kind: 'delta', agent: evt.agent, text: evt.text }, streamedActivity.length);
          if (entry) appendActivity(entry);
        } else if (evt.event === 'tool') {
          const entry = normalizeActivityEntry({ kind: 'tool', agent: evt.agent, tools: evt.tools }, streamedActivity.length);
          if (entry) appendActivity(entry);
        }
      });
      clearTimeout(timeoutId);
      timeoutId = undefined;
      abortControllerRef.current = null;
      const persistedActivity = normalizeActivityLog(data.process);
      const finalActivity = persistedActivity.length > 0 ? persistedActivity : streamedActivity;
      const newAssistantMessage: Message = {
        id: `${Date.now().toString()}-${Math.random()}`,
        content: data.message || '',
        thinking: Array.isArray(data.thinking) ? data.thinking : [],
        sender: 'assistant',
        timestamp: new Date(),
        type: 'text',
        activityLog: finalActivity,
      };
      setConversations(prev => prev.map(conv => {
        if (conv.id === currentConversationId) {
          return {
            ...conv,
            messages: conv.messages.map(m => (m.id === pendingAssistantId ? newAssistantMessage : m)),
            updatedAt: new Date()
          };
        }
        return conv;
      }));
      const refreshed = await refreshConversation(currentConversationId);
      setMessages(refreshed.messages);
      setSessionId(refreshed.sessionId || null);
    } catch (error) {
      await haltBackendAgentAfterUiFailure(currentConversationId);
      if (isAbortLikeError(error)) {
        setSnackbar({ open: true, message: 'Request cancelled', severity: 'warning' });
      } else {
        console.error('Failed to regenerate:', error);
        setSnackbar({ open: true, message: formatApiError(error), severity: 'error' });
      }
      setConversations(prev => prev.map(conv => {
        if (conv.id === currentConversationId) {
          return { ...conv, messages: conv.messages.filter(m => m.id !== pendingAssistantId), updatedAt: new Date() };
        }
        return conv;
      }));
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      abortControllerRef.current = null;
      setIsLoading(false);
      setIsReplaying(false);
    }
  };
  const exportConversation = () => {
    if (!currentConversationId) return;
    const conversation = conversations.find(c => c.id === currentConversationId);
    if (!conversation) return;
    let markdown = `# ${conversation.title}\n\n`;
    markdown += `Created: ${conversation.createdAt.toLocaleString()}\n\n---\n\n`;
    conversation.messages.forEach(msg => {
      const sender = msg.sender === 'user' ? '**User**' : '**Assistant**';
      markdown += `### ${sender} - ${msg.timestamp.toLocaleString()}\n\n`;
      markdown += `${msg.content}\n\n`;
      if (msg.activityLog && msg.activityLog.length > 0) {
        markdown += `<details>\n<summary>Agent Process</summary>\n\n`;
        msg.activityLog.forEach((entry, index) => {
          markdown += `${index + 1}. **${entry.agent}** - ${entry.title}\n`;
          if (entry.body) markdown += `\n${entry.body}\n`;
          if (entry.tools?.length) markdown += `\nTools: ${entry.tools.join(', ')}\n`;
          markdown += '\n';
        });
        markdown += `</details>\n\n`;
      }
      markdown += '---\n\n';
    });
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${conversation.title.replace(/[^a-z0-9]/gi, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setSnackbar({ open: true, message: 'Conversation exported', severity: 'success' });
  };
  const filteredConversations = searchQuery.trim()
    ? conversations.filter(conv => 
        conv.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        conv.messages.some(msg => msg.content.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : conversations;
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (!hasAgentConfiguration) {
      openApiKeyDialog();
      setSnackbar({ open: true, message: 'Please configure Agent model and API key first', severity: 'warning' });
      return;
    }
    const files = Array.from(e.dataTransfer.files) as File[];
    if (files.length === 0) return;
    const convId = await ensureConversationId(currentConversationId);
    if (!convId) return;
    for (const file of files) {
      const fileId = `${Date.now()}-${Math.random()}`;
      setUploadProgress(prev => ({ ...prev, [fileId]: 0 }));
      try {
        setUploadProgress(prev => ({ ...prev, [fileId]: 50 }));
        const data = await ApiService.uploadAgentAttachment(convId, file, {
          api_key: apiKey.trim() || undefined,
          model: model.trim() || undefined,
          proxy: cleanConfigValue(proxy) || undefined,
        });
        setUploadProgress(prev => ({ ...prev, [fileId]: 100 }));
        setConversations(prev => prev.map(conv => {
          if (conv.id === convId) {
            const atts = conv.attachments || [];
            return { ...conv, attachments: [...atts, data], updatedAt: new Date() };
          }
          return conv;
        }));
        setTimeout(() => {
          setUploadProgress(prev => {
            const updated = { ...prev };
            delete updated[fileId];
            return updated;
          });
        }, 1000);
        setSnackbar({ open: true, message: `Uploaded ${file.name}`, severity: 'success' });
        const refreshed = await refreshConversation(convId);
        setMessages(refreshed.messages);
        setSessionId(refreshed.sessionId || null);
      } catch (err) {
        setUploadProgress(prev => {
          const updated = { ...prev };
          delete updated[fileId];
          return updated;
        });
        setSnackbar({ open: true, message: `${file.name}: ${formatApiError(err)}`, severity: 'error' });
      }
    }
  }, [currentConversationId, hasAgentConfiguration, model, openApiKeyDialog, proxy, refreshConversation]);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch(prev => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        createNewConversation();
      }
      if (e.key === 'Escape') {
        setShowSearch(false);
        setEditingMessageId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSaveApiKey = () => {
    const nextApiKey = cleanConfigValue(tempApiKey);
    const nextModel = cleanConfigValue(tempModel);
    const nextProxy = cleanConfigValue(tempProxy);

    if (!nextApiKey || !nextModel) {
      setSnackbar({ open: true, message: 'Agent model and API key are required', severity: 'warning' });
      return;
    }
    if (!isValidProxy(nextProxy)) {
      setSnackbar({ open: true, message: 'Proxy must start with http:// or https://, for example http://127.0.0.1:7890', severity: 'warning' });
      return;
    }

    setApiKey(nextApiKey);
    setTempApiKey(nextApiKey);
    setModel(nextModel);
    setTempModel(nextModel);
    setProxy(nextProxy);
    setTempProxy(nextProxy);
    localStorage.setItem('uprobe-agent-api-key', nextApiKey);
    localStorage.setItem('uprobe-agent-model', nextModel);
    if (nextProxy) {
      localStorage.setItem('uprobe-agent-proxy', nextProxy);
    } else {
      localStorage.removeItem('uprobe-agent-proxy');
    }
    
    setShowApiKeyDialog(false);
    setSnackbar({ open: true, message: 'Agent configuration saved in this browser', severity: 'success' });

    // Stop existing session if any
    if (sessionId) {
      void stopSession();
    }
  };

  const handleClearAgentConfig = () => {
    setApiKey('');
    setTempApiKey('');
    setModel('');
    setTempModel('');
    setProxy('');
    setTempProxy('');
    localStorage.removeItem('uprobe-agent-api-key');
    localStorage.removeItem('uprobe-agent-model');
    localStorage.removeItem('uprobe-agent-proxy');
    setShowApiKeyDialog(false);
    setSnackbar({ open: true, message: 'Agent configuration cleared from this browser', severity: 'success' });
    if (sessionId) {
      void stopSession();
    }
  };

  const renderMessage = (message: Message) => {
    const isUser = message.sender === 'user';
    const isEditing = isUser && editingMessageId === message.id;

    const isArtifactFilesystemHref = (href: string) => {
      const h = href.trim().replace(/\\/g, '/');
      if (h.includes('/agent_runs/')) return true;
      if (h.includes('/users/') && (h.includes('/results/') || h.includes('/outputs/'))) return true;
      if (/^\/(?:home|Users|var|mnt|data)\b/i.test(h) && (h.includes('outputs') || h.includes('results') || h.includes('agent_runs'))) {
        return true;
      }
      if (/^[a-zA-Z]:\//.test(h) && (h.includes('outputs') || h.includes('results') || h.includes('agent_runs'))) {
        return true;
      }
      if (/^file:/i.test(h)) {
        return h.includes('/agent_runs/') || h.includes('/users/');
      }
      return false;
    };

    const renderCodeBlock = (lang: string, code: string, key: React.Key) => (
      <Box key={key} sx={{ my: 1.5 }}>
        <Paper 
          variant="outlined" 
          sx={{ 
            backgroundColor: theme.palette.mode === 'dark' ? '#0f172a' : '#f8fafc', 
            color: theme.palette.mode === 'dark' ? '#e2e8f0' : '#0f172a', 
            overflowX: 'auto',
            border: '1px solid',
            borderColor: theme.palette.mode === 'dark' ? '#1e293b' : 'divider',
            borderRadius: 1.5,
            overflow: 'hidden'
          }}
        >
          <Box sx={{ 
            px: 1.75, 
            py: 0.75, 
            backgroundColor: theme.palette.mode === 'dark' ? '#1e293b' : 'grey.100', 
            borderBottom: '1px solid',
            borderColor: theme.palette.mode === 'dark' ? '#334155' : 'divider',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <Typography variant="caption" sx={{ color: theme.palette.mode === 'dark' ? '#94a3b8' : 'text.secondary', fontWeight: 600, fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {lang || 'code'}
            </Typography>
            <Button
              size="small"
              variant="text"
              sx={{ color: theme.palette.mode === 'dark' ? '#cbd5e1' : 'text.primary', minWidth: 0, px: 0.75, py: 0.15, textTransform: 'none', fontSize: '0.7rem' }}
              onClick={() => navigator.clipboard?.writeText(code)}
            >
              Copy
            </Button>
          </Box>
          <Box sx={{ px: 1.75, py: 1.5, overflowX: 'auto' }}>
            <pre style={{ margin: 0, fontFamily: '"JetBrains Mono", Monaco, Menlo, Consolas, monospace', fontSize: '0.8125rem', lineHeight: 1.5 }}>
              <code>{code}</code>
            </pre>
          </Box>
        </Paper>
      </Box>
    );

    const renderMarkdownContent = (content: string) => {
      const components = {
        p: ({ children }: any) => (
          <Typography component="p" sx={{ my: 0.75, lineHeight: 1.7, overflowWrap: 'anywhere' }}>
            {children}
          </Typography>
        ),
        h1: ({ children }: any) => (
          <Typography component="h1" sx={{ mt: 2, mb: 1, fontSize: '1.25rem', fontWeight: 750, lineHeight: 1.35 }}>
            {children}
          </Typography>
        ),
        h2: ({ children }: any) => (
          <Typography component="h2" sx={{ mt: 1.75, mb: 1, fontSize: '1.12rem', fontWeight: 750, lineHeight: 1.35 }}>
            {children}
          </Typography>
        ),
        h3: ({ children }: any) => (
          <Typography component="h3" sx={{ mt: 1.5, mb: 0.75, fontSize: '1rem', fontWeight: 700, lineHeight: 1.35 }}>
            {children}
          </Typography>
        ),
        ul: ({ children }: any) => (
          <Box component="ul" sx={{ my: 0.75, pl: 3, '& li': { mb: 0.5 } }}>
            {children}
          </Box>
        ),
        ol: ({ children }: any) => (
          <Box component="ol" sx={{ my: 0.75, pl: 3, '& li': { mb: 0.5 } }}>
            {children}
          </Box>
        ),
        li: ({ children }: any) => (
          <Typography component="li" sx={{ lineHeight: 1.7, overflowWrap: 'anywhere' }}>
            {children}
          </Typography>
        ),
        a: ({ href = '', children }: any) => {
          if (currentConversationId && isArtifactFilesystemHref(String(href))) {
            const fileHref = apiPublicHref(buildArtifactUrl(String(href)));
            const linkBasename = String(href).replace(/\\/g, '/').split('/').pop() || String(children);
            return (
              <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', verticalAlign: 'middle' }}>
                <Typography component="span" variant="body2">
                  {children}
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  sx={{ minHeight: 26, textTransform: 'none', py: 0.15, px: 0.6, fontSize: '0.7rem' }}
                  onClick={() => void triggerAuthenticatedArtifactDownload(fileHref, linkBasename)}
                >
                  Download
                </Button>
              </Box>
            );
          }
          const url = /^https?:\/\//i.test(String(href)) ? String(href) : apiPublicHref(String(href));
          return (
            <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: theme.palette.primary.main, textDecoration: 'underline', fontWeight: 500 }}>
              {children}
            </a>
          );
        },
        pre: ({ children }: any) => <>{children}</>,
        code: ({ className, children }: any) => {
          const raw = String(children ?? '').replace(/\n$/, '');
          const lang = String(className || '').replace(/^language-/, '');
          const isBlock = Boolean(className) || raw.includes('\n');
          if (isBlock) return renderCodeBlock(lang, raw, `md-code-${raw.slice(0, 24)}`);
          return (
            <code
              style={{
                backgroundColor: theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[100],
                color: theme.palette.error.main,
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '0.875em',
                fontFamily: 'ui-monospace, Menlo, Monaco, Consolas, monospace',
                overflowWrap: 'anywhere',
              }}
            >
              {children}
            </code>
          );
        },
        table: ({ children }: any) => (
          <TableContainer component={Paper} variant="outlined" sx={{ my: 1.5, maxWidth: '100%', overflowX: 'auto', borderRadius: 1.5 }}>
            <Table size="small" sx={{ minWidth: 520, '& th, & td': { whiteSpace: 'normal', overflowWrap: 'anywhere', verticalAlign: 'top' } }}>
              {children}
            </Table>
          </TableContainer>
        ),
        thead: ({ children }: any) => <TableHead>{children}</TableHead>,
        tbody: ({ children }: any) => <TableBody>{children}</TableBody>,
        tr: ({ children }: any) => <TableRow hover>{children}</TableRow>,
        th: ({ children }: any) => (
          <TableCell sx={{ fontWeight: 750, bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)' }}>
            {children}
          </TableCell>
        ),
        td: ({ children }: any) => <TableCell>{children}</TableCell>,
      };

      return (
        <Box sx={{ '& > :first-of-type': { mt: 0 }, '& > :last-child': { mb: 0 }, overflowWrap: 'anywhere' }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} components={components}>
            {content}
          </ReactMarkdown>
        </Box>
      );

      /*
      // Legacy hand-written Markdown parser. Kept commented while the UI uses
      // ReactMarkdown + remark-gfm above for GFM tables and responsive content.
      // Enhanced Markdown parser with code blocks, formatting, lists, headings
      const parts: React.ReactNode[] = [];
      const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      
      // Enhanced text formatter with Markdown support
      const formatText = (text: string): React.ReactNode[] => {
        const lines = text.split('\n');
        const elements: React.ReactNode[] = [];
        
        lines.forEach((line, lineIdx) => {
          // Check for headings (### or ## or #)
          const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
          if (headingMatch) {
            const level = headingMatch[1].length;
            const headingText = headingMatch[2];
            const fontSize = level === 1 ? '1.25rem' : level === 2 ? '1.1rem' : '1rem';
            const fontWeight = level === 1 ? 700 : 600;
            elements.push(
              <Typography 
                key={`heading-${lineIdx}`} 
                sx={{ 
                  fontSize, 
                  fontWeight, 
                  color: 'text.primary', 
                  mt: lineIdx > 0 ? 2 : 0, 
                  mb: 1,
                  lineHeight: 1.4
                }}
              >
                {formatInlineMarkdown(headingText, `h-${lineIdx}`)}
              </Typography>
            );
            return;
          }
          
          // Check for list items (- or *)
          const listMatch = line.match(/^[\s]*[-*]\s+(.+)$/);
          if (listMatch) {
            elements.push(
              <Box key={`list-${lineIdx}`} sx={{ display: 'flex', gap: 1, mb: 0.5, pl: 2 }}>
                <Typography sx={{ color: 'text.secondary', minWidth: '20px' }}>•</Typography>
                <Typography sx={{ flex: 1, color: 'text.primary' }}>
                  {formatInlineMarkdown(listMatch[1], `li-${lineIdx}`)}
                </Typography>
              </Box>
            );
            return;
          }
          
          // Regular paragraph
          if (line.trim()) {
            elements.push(
              <Typography 
                key={`p-${lineIdx}`} 
                component="div"
                sx={{ color: 'text.primary', mb: 0.75, lineHeight: 1.65 }}
              >
                {formatInlineMarkdown(line, `p-${lineIdx}`)}
              </Typography>
            );
          } else if (lineIdx < lines.length - 1) {
            // Empty line - add spacing
            elements.push(<Box key={`space-${lineIdx}`} sx={{ height: '0.5rem' }} />);
          }
        });
        
        return elements;
      };
      
      // Format inline markdown (bold, italic, links, inline code)
      const formatInlineMarkdown = (text: string, keyPrefix: string): React.ReactNode[] => {
        const nodes: React.ReactNode[] = [];
        const remaining = text;
        let nodeIndex = 0;

        const inlineRegex =
          /(\[([^\]]+)\]\(([^)]+)\))|(\*\*(.+?)\*\*)|(\*(.+?)\*)|(https?:\/\/[^\s]+)|(\/agent\/[^\s]+)|(`([^`]+)`)/g;
        let lastIdx = 0;
        let m: RegExpExecArray | null;

        while ((m = inlineRegex.exec(remaining)) !== null) {
          if (m.index > lastIdx) {
            nodes.push(<span key={`${keyPrefix}-t-${nodeIndex++}`}>{remaining.slice(lastIdx, m.index)}</span>);
          }

          if (m[1]) {
            const label = m[2];
            const href = m[3];
            if (currentConversationId && isArtifactFilesystemHref(href)) {
              const fileHref = apiPublicHref(buildArtifactUrl(href));
              const linkBasename =
                href.replace(/\\/g, '/').split('/').pop() || label;
              nodes.push(
                <Box
                  component="span"
                  key={`${keyPrefix}-art-${nodeIndex++}`}
                  sx={{
                    display: 'inline-flex',
                    gap: 0.5,
                    alignItems: 'center',
                    verticalAlign: 'middle',
                    flexWrap: 'wrap',
                    mr: 0.5,
                  }}
                >
                  <Typography component="span" variant="body2" sx={{ mr: 0.25 }}>
                    {label}
                  </Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    sx={{ minHeight: 26, textTransform: 'none', py: 0.15, px: 0.6, fontSize: '0.7rem' }}
                    onClick={() => void triggerAuthenticatedArtifactDownload(fileHref, linkBasename)}
                  >
                    Download
                  </Button>
                  <Button
                    size="small"
                    variant="text"
                    sx={{ minHeight: 26, textTransform: 'none', py: 0.15, px: 0.6, fontSize: '0.7rem' }}
                    onClick={() => void triggerAuthenticatedArtifactOpen(fileHref)}
                  >
                    Open
                  </Button>
                </Box>,
              );
            } else if (isArtifactFilesystemHref(href)) {
              nodes.push(
                <Typography
                  key={`${keyPrefix}-art-ph-${nodeIndex++}`}
                  component="span"
                  variant="caption"
                  sx={{ fontStyle: 'italic', color: 'text.secondary' }}
                >
                  {label}
                </Typography>,
              );
            } else {
              const url = /^https?:\/\//i.test(href) ? href : apiPublicHref(href);
              nodes.push(
                <a
                  key={`${keyPrefix}-a-${nodeIndex++}`}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: theme.palette.primary.main,
                    textDecoration: 'underline',
                    fontWeight: 500,
                  }}
                >
                  {label}
                </a>,
              );
            }
          } else if (m[4]) {
            nodes.push(
              <strong key={`${keyPrefix}-b-${nodeIndex++}`} style={{ fontWeight: 600, color: theme.palette.text.primary }}>
                {m[5]}
              </strong>,
            );
          } else if (m[6]) {
            nodes.push(<em key={`${keyPrefix}-i-${nodeIndex++}`} style={{ fontStyle: 'italic' }}>{m[7]}</em>);
          } else if (m[8]) {
            const url = m[8];
            nodes.push(
              <a
                key={`${keyPrefix}-http-${nodeIndex++}`}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: theme.palette.primary.main,
                  textDecoration: 'underline',
                  fontWeight: 500,
                }}
              >
                {url}
              </a>,
            );
          } else if (m[9]) {
            const rawApiPath = m[9];
            const apiUrl = apiPublicHref(rawApiPath);
            const baseLabel = rawApiPath.replace(/\\/g, '/').split('/').pop() || rawApiPath;
            if (currentConversationId && rawApiPath.includes(`/agent/conversations/${currentConversationId}/files/`)) {
              nodes.push(
                <Box
                  component="span"
                  key={`${keyPrefix}-api-${nodeIndex++}`}
                  sx={{
                    display: 'inline-flex',
                    gap: 0.5,
                    alignItems: 'center',
                    verticalAlign: 'middle',
                    flexWrap: 'wrap',
                  }}
                >
                  <Typography component="span" variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                    {baseLabel}
                  </Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    sx={{ minHeight: 26, textTransform: 'none', py: 0.15, px: 0.6, fontSize: '0.7rem' }}
                    onClick={() => void triggerAuthenticatedArtifactDownload(apiUrl, baseLabel)}
                  >
                    Download
                  </Button>
                  <Button
                    size="small"
                    variant="text"
                    sx={{ minHeight: 26, textTransform: 'none', py: 0.15, px: 0.6, fontSize: '0.7rem' }}
                    onClick={() => void triggerAuthenticatedArtifactOpen(apiUrl)}
                  >
                    Open
                  </Button>
                </Box>,
              );
            } else {
              nodes.push(
                <a
                  key={`${keyPrefix}-api-${nodeIndex++}`}
                  href={apiUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: theme.palette.primary.main,
                    textDecoration: 'underline',
                    fontWeight: 500,
                  }}
                >
                  {rawApiPath}
                </a>,
              );
            }
          } else if (m[10]) {
            nodes.push(
              <code
                key={`${keyPrefix}-c-${nodeIndex++}`}
                style={{
                  backgroundColor: theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[100],
                  color: theme.palette.error.main,
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '0.875em',
                  fontFamily: 'monospace',
                }}
              >
                {m[11]}
              </code>,
            );
          }

          lastIdx = inlineRegex.lastIndex;
        }

        if (lastIdx < remaining.length) {
          nodes.push(<span key={`${keyPrefix}-end`}>{remaining.slice(lastIdx)}</span>);
        }

        return nodes.length > 0 ? nodes : [<span key={`${keyPrefix}-fallback`}>{text}</span>];
      };
      
      // Process code blocks
      while ((match = codeBlockRegex.exec(content)) !== null) {
        if (match.index > lastIndex) {
          const text = content.slice(lastIndex, match.index);
          parts.push(<Box key={`t-${lastIndex}`}>{formatText(text)}</Box>);
        }
        const lang = (match[1] || '').toLowerCase();
        const code = match[2];
        parts.push(renderCodeBlock(lang, code, `c-${match.index}`));
        lastIndex = codeBlockRegex.lastIndex;
      }
      if (lastIndex < content.length) {
        const text = content.slice(lastIndex);
        parts.push(<Box key={`t-end`}>{formatText(text)}</Box>);
      }
      return parts;
      */
    };
    const normalizeText = (text: string) => {
      if (!text) return '';
      return text
        .replace(/\r\n/g, '\n')
        .replace(/\\n/g, '\n')
        .trim();
    };
    const primaryThinking = normalizeText((message.thinking && message.thinking.length > 0) ? message.thinking.join('\n') : '');
    const finalMessage = normalizeText(message.content || '');
    const combinedContent = finalMessage || primaryThinking;

    const combinedContentFlat = joinBrokenAgentRunsPaths(
      flattenMarkdownFileLinks(combinedContent.replace(/\r\n/g, '\n')),
    );

    const outputArtifacts = collectOutputArtifacts(combinedContentFlat);
    const combinedContentDisplay = scrubArtifactPathsForDisplay(
      stripDownloadableArtifactsSection(preprocessArtifactCodeBlocksForDisplay(combinedContentFlat)),
      outputArtifacts,
    );

    const normalizeResultMarkdownSections = (content: string): string => {
      const labels = ['Key Metrics', 'Next Step', 'Generated Files', 'Result', 'Output', 'Outputs', 'Artifacts', 'Assessment'];
      const labelPattern = labels.map((label) => label.replace(/\s+/g, '\\s+')).join('|');
      return content
        .split(/(```[\s\S]*?```)/g)
        .map((part, index) => {
          if (index % 2 === 1) return part;
          return part
            .replace(
              new RegExp(`(^|\\n|\\s)(?:\\*\\*)?(${labelPattern})(?:\\*\\*)?\\s*:?\\s+`, 'g'),
              (_match, prefix: string, label: string) => `${prefix.trim() ? '\n\n' : prefix}### ${label.replace(/\s+/g, ' ')}\n\n`,
            )
            .replace(/\n{3,}/g, '\n\n');
        })
        .join('')
        .replace(/\n*###\s+(?:Output|Outputs|Artifacts|Generated Files)\s*\n\n(?=###\s+)/gi, '\n\n')
        .replace(/\n*###\s+(?:Output|Outputs|Artifacts|Generated Files)\s*$/gi, '')
        .trim();
    };

    const sectionedContentDisplay = normalizeResultMarkdownSections(combinedContentDisplay);

    const extractMetricCards = (content: string): { metrics: { label: string; value: string }[]; content: string } => {
      const lines = content.split('\n');
      const metrics: { label: string; value: string }[] = [];
      const out: string[] = [];
      let inMetrics = false;
      for (const line of lines) {
        const trimmed = line.trim();
        if (/^#{0,4}\s*key metrics\s*:?\s*$/i.test(trimmed)) {
          inMetrics = true;
          continue;
        }
        if (inMetrics) {
          const item = trimmed.match(/^[-*]?\s*([^:：]+)[:：]\s*(.+)$/);
          if (item) {
            metrics.push({ label: item[1].trim(), value: item[2].trim() });
            continue;
          }
          if (!trimmed) continue;
          if (/^#{1,4}\s+/.test(trimmed) || /^[A-Z][\w\s]{1,40}:?$/.test(trimmed)) {
            inMetrics = false;
            out.push(line);
            continue;
          }
        }
        out.push(line);
      }
      return { metrics, content: out.join('\n').replace(/\n{3,}/g, '\n\n').trim() };
    };

    const { metrics: keyMetrics, content: finalContentDisplay } = extractMetricCards(sectionedContentDisplay);

    const hasActivity = Boolean(!isUser && message.activityLog && message.activityLog.length > 0);
    const hasBubbleText = Boolean(finalContentDisplay.trim());
    const streamingPending =
      !isUser &&
      message.id.startsWith('pending-') &&
      isLoading &&
      !hasBubbleText;
    const processRunning = !isUser && message.id.startsWith('pending-') && isLoading;

    const renderProcessPanel = (entries: AgentProcessEntry[], running: boolean) => {
      const toolCount = entries.filter(entry => entry.kind === 'tool_call' || entry.kind === 'command' || entry.kind === 'file').length;
      const agents = Array.from(new Set(entries.map(entry => entry.agent).filter(Boolean)));
      const latest = entries.slice(-8);
      const summary = running
        ? 'Working'
        : `Completed ${entries.length} step${entries.length === 1 ? '' : 's'}${toolCount ? ` · ${toolCount} tool${toolCount === 1 ? '' : 's'}` : ''}`;

      const entryIcon = (entry: AgentProcessEntry) => {
        if (entry.kind === 'command') return <Code sx={{ fontSize: 15 }} />;
        if (entry.kind === 'file') return <InsertDriveFile sx={{ fontSize: 15 }} />;
        if (entry.kind === 'tool_call') return <Science sx={{ fontSize: 15 }} />;
        return <AutoAwesome sx={{ fontSize: 15 }} />;
      };

      return (
        <Box
          component="details"
          open={running}
          sx={{
            mb: hasBubbleText || running ? 1.25 : 0,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1.5,
            bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(15,23,42,0.03)',
            overflow: 'hidden',
            '& summary': {
              cursor: 'pointer',
              listStyle: 'none',
              '&::-webkit-details-marker': { display: 'none' },
            },
          }}
        >
          <Box
            component="summary"
            sx={{
              px: 1.25,
              py: 0.9,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            {running ? <CircularProgress size={14} thickness={4} /> : <AutoAwesome sx={{ fontSize: 16, color: 'text.secondary' }} />}
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary' }}>
              Agent Process
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', flex: 1 }}>
              {summary}
            </Typography>
            {agents.slice(0, 2).map(agent => (
              <Chip key={agent} label={agent} size="small" sx={{ height: 20, fontSize: '0.68rem' }} />
            ))}
          </Box>
          <Divider />
          <Box sx={{ px: 1.25, py: 1, maxHeight: 320, overflowY: 'auto' }}>
            {latest.map((entry, i) => (
              <Box key={entry.id || i} sx={{ display: 'grid', gridTemplateColumns: '22px 1fr', gap: 0.75, mb: i === latest.length - 1 ? 0 : 1 }}>
                <Box
                  sx={{
                    mt: 0.15,
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'divider',
                    color: 'text.secondary',
                  }}
                >
                  {entryIcon(entry)}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary' }}>
                      {entry.title}
                    </Typography>
                    <Chip label={entry.agent} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.65rem' }} />
                  </Box>
                  {entry.tools && entry.tools.length > 0 ? (
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                      {entry.tools.map(tool => (
                        <Chip key={tool} label={friendlyToolName(tool)} size="small" sx={{ height: 20, fontSize: '0.65rem' }} />
                      ))}
                    </Box>
                  ) : null}
                  {entry.body ? (
                    <Box
                      sx={{
                        mt: 0.5,
                        color: 'text.secondary',
                        fontSize: '0.78rem',
                        lineHeight: 1.55,
                        maxHeight: 96,
                        overflow: 'auto',
                        pr: 0.5,
                      }}
                    >
                      {renderMarkdownContent(entry.body)}
                    </Box>
                  ) : null}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      );
    };

    const renderMetricCards = (metrics: { label: string; value: string }[]) => {
      if (!metrics.length) return null;
      const cleanMetricText = (text: string) =>
        text
          .replace(/\*\*([^*]+)\*\*/g, '$1')
          .replace(/\*([^*\n]+)\*/g, '$1')
          .replace(/`([^`]+)`/g, '$1')
          .replace(/\s+,/g, ',')
          .replace(/,\s*/g, ', ')
          .replace(/\s{2,}/g, ' ')
          .trim();
      return (
        <Box sx={{ mb: 1.75 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary', mb: 1 }}>
            Key metrics
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fit, minmax(150px, 1fr))' }, gap: 1 }}>
            {metrics.map((metric, idx) => (
              <Paper
                key={`${metric.label}-${idx}`}
                variant="outlined"
                sx={{
                  p: 1.25,
                  borderRadius: 2,
                  bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.025)' : alpha(theme.palette.primary.main, 0.04),
                }}
              >
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.35 }}>
                  {cleanMetricText(metric.label)}
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 750, fontSize: '1.05rem', lineHeight: 1.25 }}>
                  {cleanMetricText(metric.value)}
                </Typography>
              </Paper>
            ))}
          </Box>
        </Box>
      );
    };

    return (
      <Fade in={true} timeout={300} key={message.id}>
        <Box
          sx={{
            display: 'flex',
            mb: 2,
            flexDirection: isUser ? 'row-reverse' : 'row',
            alignItems: 'flex-start',
            '&:hover .message-actions': {
              opacity: 1
            }
          }}
        >
          <Avatar
            sx={{
              bgcolor: isUser ? theme.palette.primary.main : theme.palette.secondary.main,
              mx: 1,
              width: 28,
              height: 28
            }}
          >
            {isUser ? <Person sx={{ fontSize: 16 }} /> : <SmartToy sx={{ fontSize: 16 }} />}
          </Avatar>
          <Paper
            elevation={0}
            sx={{
              py: 1.25,
              px: 1.75,
              ...(isUser
                ? { 
                    backgroundColor: 'action.hover',
                    boxShadow: 'none'
                  }
                : { 
                    backgroundColor: 'background.paper',
                    boxShadow: 'none'
                  }
              ),
              color: 'text.primary',
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
              maxWidth: isEditing ? '85%' : { xs: 'calc(100% - 44px)', md: 'min(900px, 82%)' },
              width: isEditing ? '100%' : isUser ? 'fit-content' : '100%',
              minWidth: 0,
            }}
          >
            {!isUser && hasActivity ? renderProcessPanel(message.activityLog!, processRunning) : null}
            {isEditing ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                <TextField
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleEditSave(message);
                    }
                  }}
                  multiline
                  minRows={1}
                  maxRows={8}
                  fullWidth
                  variant="outlined"
                  autoFocus
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      backgroundColor: 'background.default',
                      fontSize: '0.9375rem',
                      lineHeight: 1.65,
                      paddingY: 0.75,
                      '&.Mui-focused fieldset': { 
                        borderColor: theme.palette.primary.main, 
                        borderWidth: 1.5,
                        boxShadow: `0 0 0 2px ${alpha(theme.palette.primary.main, 0.15)}`
                      }
                    }
                  }}
                />
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5, mt: 0.5 }}>
                  <Tooltip title="Cancel (Esc)">
                    <IconButton
                      size="small"
                      onClick={handleEditCancel}
                      sx={{
                        width: 26,
                        height: 26,
                        color: 'text.secondary',
                        '&:hover': { color: 'error.main', backgroundColor: 'rgba(239, 68, 68, 0.08)' }
                      }}
                    >
                      <Close sx={{ fontSize: 15 }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Save & Run (Enter)">
                    <IconButton
                      size="small"
                      onClick={() => handleEditSave(message)}
                      disabled={isLoading || isReplaying}
                      sx={{
                        width: 26,
                        height: 26,
                        color: 'text.secondary',
                        '&:hover': { color: 'success.main', backgroundColor: 'rgba(16, 185, 129, 0.08)' },
                        '&:disabled': { color: 'text.disabled' }
                      }}
                    >
                      <Send sx={{ fontSize: 13 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
            ) : (
              <>
                {!isUser && !isEditing && renderMetricCards(keyMetrics)}
                {!isUser && !isEditing && renderOutputArtifactsPanel(outputArtifacts)}
                {hasBubbleText ? (
                  <Typography
                    variant="body1"
                    component="div"
                    sx={{
                      lineHeight: 1.65,
                      whiteSpace: 'normal',
                      fontSize: '0.9375rem',
                      color: 'text.primary',
                      overflowWrap: 'anywhere',
                      '& p': {
                        margin: '0.5em 0'
                      },
                      '& a': {
                        color: theme.palette.primary.main,
                        textDecoration: 'none',
                        '&:hover': {
                          textDecoration: 'underline'
                        }
                      }
                    }}
                  >
                    {renderMarkdownContent(finalContentDisplay)}
                  </Typography>
                ) : null}
                {streamingPending ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: hasBubbleText ? 0 : 0.5 }}>
                    <CircularProgress size={14} thickness={4} sx={{ color: 'text.secondary' }} />
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
                      Working…
                    </Typography>
                  </Box>
                ) : null}
              </>
            )}
            {/* Attachments in message bubble */}
            {isUser && message.attachments && message.attachments.length > 0 && (
              <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', mb: 1, display: 'block', fontWeight: 600 }}>
                  Attached Files
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  {message.attachments.map(att => (
                    <Box 
                      key={att.id}
                      sx={{ 
                        display: 'flex',
                        alignItems: 'center',
                        p: 1,
                        borderRadius: 1.5,
                        backgroundColor: 'background.default',
                        border: '1px solid',
                        borderColor: 'divider',
                        transition: 'all 0.2s',
                        cursor: 'pointer',
                        '&:hover': {
                          backgroundColor: 'action.hover',
                          borderColor: theme.palette.primary.main
                        }
                      }}
                      onClick={() => void triggerAuthenticatedArtifactOpen(apiPublicHref(att.url))}
                    >
                      <InsertDriveFile sx={{ fontSize: 16, color: theme.palette.primary.main, mr: 1 }} />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography 
                          variant="caption" 
                          sx={{ 
                            color: 'text.primary',
                            fontWeight: 500,
                            display: 'block',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {att.filename}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                          {(att.size / 1024).toFixed(1)} KB
                        </Typography>
                      </Box>
                      <Download sx={{ fontSize: 16, color: 'text.secondary' }} />
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
          </Paper>
          
          {/* Action buttons beside bubble */}
          {!isUser && !isEditing && (
            <Box 
              className="message-actions"
              sx={{ 
                ml: 0.5,
                display: 'flex',
                flexDirection: 'column',
                gap: 0.25, 
                opacity: message.id.startsWith('pending-') && isLoading ? 1 : 0,
                transition: 'opacity 0.2s ease'
              }}
            >
              {message.id.startsWith('pending-') && isLoading ? (
                <Tooltip title="Cancel" placement="right">
                  <IconButton
                    size="small"
                    sx={{ 
                      width: 24,
                      height: 24,
                      color: 'error.main',
                      '&:hover': { 
                        color: 'error.dark', 
                        backgroundColor: 'rgba(239, 68, 68, 0.08)' 
                      }
                    }}
                    onClick={handleCancelRequest}
                  >
                    <Close sx={{ fontSize: 14 }} />
                  </IconButton>
                </Tooltip>
              ) : (
                <>
                  <Tooltip title="Copy" placement="right">
                    <IconButton
                      size="small"
                      sx={{ 
                        width: 24,
                        height: 24,
                        color: 'text.secondary',
                        '&:hover': { 
                          color: 'text.primary', 
                          backgroundColor: 'action.hover' 
                        }
                      }}
                      onClick={() => {
                        navigator.clipboard.writeText(combinedContent);
                        setSnackbar({ open: true, message: 'Copied', severity: 'success' });
                      }}
                    >
                      <ContentCopy sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Retry" placement="right">
                    <IconButton
                      size="small"
                      sx={{ 
                        width: 24,
                        height: 24,
                        color: 'text.secondary',
                        '&:hover': { 
                          color: 'text.primary', 
                          backgroundColor: 'action.hover' 
                        },
                        '&:disabled': { color: 'text.disabled' }
                      }}
                      onClick={() => handleRegenerateMessage(message.id)}
                      disabled={isLoading}
                    >
                      <Refresh sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                </>
              )}
            </Box>
          )}
          {isUser && !isEditing && (
            <Box 
              className="message-actions"
              sx={{ 
                mr: 0.5,
                display: 'flex',
                flexDirection: 'column',
                gap: 0.25, 
                opacity: 0, 
                transition: 'opacity 0.2s ease'
              }}
            >
              <Tooltip title="Edit" placement="left">
                <IconButton
                  size="small"
                  sx={{ 
                    width: 24,
                    height: 24,
                    color: 'text.secondary',
                    '&:hover': { 
                      color: 'text.primary', 
                      backgroundColor: 'action.hover' 
                    }
                  }}
                  onClick={() => handleEditStart(message)}
                >
                  <Edit sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
            </Box>
          )}
        </Box>
      </Fade>
    );
  };

  return (
    <Box sx={{
      height: { xs: 'calc(100dvh - 56px)', sm: 'calc(100dvh - 60px)' },
      display: 'flex',
      backgroundColor: 'background.default'
    }}>
      <Box sx={{ width: '100%', display: 'flex', height: '100%' }}>
          {/* Left Sidebar - Conversation History */}
          {!isMobile && !sidebarCollapsed && (
            <Box
              sx={{
                width: '280px',
                flexShrink: 0,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                borderRight: '1px solid',
                borderColor: 'divider',
                backgroundColor: 'background.paper'
              }}
            >
                {/* Header */}
                <Box sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider', backgroundColor: 'background.paper', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '64px' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1.125rem', color: 'text.primary' }}>
                      Chat
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Tooltip title="New Chat (Ctrl+N)">
                        <IconButton size="small" onClick={createNewConversation}>
                          <Add fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Search (Ctrl+K)">
                        <IconButton
                          size="small"
                          onClick={() => setShowSearch(prev => !prev)}
                          sx={{ color: showSearch ? theme.palette.primary.main : 'inherit' }}
                        >
                          <Search fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={hasAgentConfiguration ? 'Agent configured' : 'Configure Agent'}>
                        <IconButton
                          size="small"
                          onClick={openApiKeyDialog}
                          sx={{
                            color: hasAgentConfiguration ? 'success.main' : 'text.secondary',
                            backgroundColor: hasAgentConfiguration ? 'rgba(34, 197, 94, 0.08)' : 'transparent',
                            '&:hover': {
                              color: hasAgentConfiguration ? 'success.dark' : 'text.primary',
                              backgroundColor: hasAgentConfiguration ? 'rgba(34, 197, 94, 0.14)' : 'action.hover',
                            }
                          }}
                        >
                          <Settings fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Collapse Sidebar">
                        <IconButton size="small" onClick={() => setSidebarCollapsed(true)}>
                          <ChevronLeft fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                </Box>
                {showSearch && (
                  <Box sx={{ px: 3, pb: 1.5 }}>
                    <TextField
                      fullWidth
                      size="small"
                      placeholder="Search conversations... (Ctrl+K)"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      sx={{ mt: 1.25 }}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <Search />
                          </InputAdornment>
                        ),
                        endAdornment: searchQuery && (
                          <InputAdornment position="end">
                            <IconButton size="small" onClick={() => setSearchQuery('')}>
                              <Close fontSize="small" />
                            </IconButton>
                          </InputAdornment>
                        )
                      }}
                    />
                  </Box>
                )}

                {/* Conversation List */}
                <Box sx={{ flex: 1, overflowY: 'auto', px: 1.5, py: 1 }}>
                  {filteredConversations.length === 0 ? (
                    <Box sx={{ textAlign: 'center', py: 6 }}>
                      <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
                        {searchQuery ? 'No matching conversations' : 'No conversations yet'}
                      </Typography>
                    </Box>
                  ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      {filteredConversations.map((conversation) => (
                        <Box
                          key={conversation.id}
                          onClick={() => setCurrentConversationId(conversation.id)}
                          sx={{
                            position: 'relative',
                            cursor: 'pointer',
                            py: 1,
                            px: 1.5,
                            borderRadius: 1.5,
                            transition: 'background-color 0.15s ease',
                            backgroundColor: currentConversationId === conversation.id ? 
                              alpha(theme.palette.primary.main, 0.12) : 
                              'transparent',
                            '&:hover': {
                              backgroundColor: currentConversationId === conversation.id ? 
                                alpha(theme.palette.primary.main, 0.18) : 
                                alpha(theme.palette.text.primary, 0.06),
                              '& .action-icons': {
                                opacity: 1
                              }
                            }
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                            {editingConversationId === conversation.id ? (
                              <TextField
                                size="small"
                                value={editConversationTitle}
                                onChange={(e) => setEditConversationTitle(e.target.value)}
                                onBlur={handleEditConversationSave}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleEditConversationSave(e);
                                  } else if (e.key === 'Escape') {
                                    setEditingConversationId(null);
                                  }
                                }}
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                                sx={{
                                  '& .MuiInputBase-root': {
                                    fontSize: '0.875rem',
                                    height: '28px',
                                    padding: '0 8px',
                                  }
                                }}
                              />
                            ) : (
                              <Typography 
                                variant="body2"
                                noWrap
                                sx={{ 
                                  flex: 1,
                                  fontSize: '0.875rem',
                                  fontWeight: currentConversationId === conversation.id ? 500 : 400,
                                  color: currentConversationId === conversation.id ? 'text.primary' : 'text.secondary',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis'
                                }}
                              >
                                {conversation.title}
                              </Typography>
                            )}
                            <Box className="action-icons" sx={{ display: 'flex', opacity: 0, transition: 'opacity 0.15s ease' }}>
                              <IconButton
                                size="small"
                                onClick={(e) => handleEditConversationStart(e, conversation)}
                                sx={{ 
                                  width: 24,
                                  height: 24,
                                  color: 'text.secondary',
                                  '&:hover': { 
                                    color: 'primary.main',
                                    backgroundColor: alpha(theme.palette.primary.main, 0.12),
                                  }
                                }}
                              >
                                <Edit sx={{ fontSize: 14 }} />
                              </IconButton>
                              <IconButton
                                size="small"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteConversation(conversation.id);
                                }}
                                sx={{ 
                                  width: 24,
                                  height: 24,
                                  color: 'text.secondary',
                                  '&:hover': { 
                                    color: 'error.main',
                                    backgroundColor: 'rgba(239, 68, 68, 0.1)'
                                  }
                                }}
                              >
                                <Delete sx={{ fontSize: 16 }} />
                              </IconButton>
                            </Box>
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  )}
                </Box>

                {/* Suggested Prompts */}
                <Box sx={{ px: 3, py: 1.5, borderTop: '1px solid', borderColor: 'divider', backgroundColor: 'background.paper' }}>
                  <Typography variant="caption" sx={{ mb: 1, display: 'block', color: 'text.secondary', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Quick Starts
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    {suggestedPrompts.slice(0, 2).map((prompt, index) => (
                      <Box
                        key={index}
                        onClick={() => handleSuggestedPrompt(prompt.prompt)}
                        sx={{
                          py: 0.75,
                          px: 1.25,
                          borderRadius: 1.5,
                          cursor: 'pointer',
                          fontSize: '0.8125rem',
                          color: theme.palette.primary.main,
                          fontWeight: 500,
                          transition: 'background-color 0.15s ease',
                          '&:hover': {
                            backgroundColor: alpha(theme.palette.primary.main, 0.1)
                          }
                        }}
                      >
                        {prompt.title}
                      </Box>
                    ))}
                  </Box>
                </Box>
            </Box>
          )}
          {/* Collapsed Sidebar Toggle */}
          {!isMobile && sidebarCollapsed && (
            <Box sx={{ display: 'flex', alignItems: 'flex-start', p: 2 }}>
              <Tooltip title="Expand Sidebar">
                <IconButton 
                  onClick={() => setSidebarCollapsed(false)}
                  sx={{ 
                    backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                    '&:hover': {
                      backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'
                    }
                  }}
                >
                  <MenuOpen />
                </IconButton>
              </Tooltip>
            </Box>
          )}
          {/* Main Chat Area */}
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: 'background.default',
              position: 'relative'
            }}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
              {/* Drag Overlay */}
              {isDragging && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: alpha(theme.palette.primary.main, 0.06),
                    border: `2px dashed ${theme.palette.primary.main}`,
                    borderRadius: 0,
                    zIndex: 1000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backdropFilter: 'blur(2px)'
                  }}
                >
                  <Box sx={{ textAlign: 'center' }}>
                    <Attachment sx={{ fontSize: 48, color: theme.palette.primary.main, mb: 1.5, opacity: 0.8 }} />
                    <Typography variant="body1" sx={{ color: theme.palette.primary.main, fontWeight: 500 }}>
                      Drop files to upload
                    </Typography>
                  </Box>
                </Box>
              )}
              {/* Chat Header */}
              <Box
                sx={{
                  px: 3,
                  py: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  backgroundColor: 'background.paper',
                  minHeight: '64px'
                }}
              >
                  <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                    <Typography variant="h6" noWrap sx={{ fontWeight: 600, fontSize: '1.125rem', color: 'text.primary' }}>
                     ✨ U-Probe Assistant
                    </Typography>
                  </Box>
                  {currentConversationId && (
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Tooltip title="Export">
                        <IconButton size="small" onClick={exportConversation} sx={{ color: 'text.secondary' }}>
                          <FileDownload fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Clear">
                        <IconButton size="small" onClick={handleClearChat} sx={{ color: 'text.secondary' }}>
                          <RestartAlt fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  )}
              </Box>

                {/* Message List */}
              <Box
                sx={{
                  flex: 1,
                  px: 3,
                  py: 2,
                  overflowY: 'auto',
                  backgroundColor: 'background.default',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                {messages.length === 0 ? (
                  <Box
                    sx={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      textAlign: 'center'
                    }}
                  >
                    <Box sx={{ maxWidth: 400 }}>
                      <Typography variant="h5" sx={{ mb: 1.5, fontWeight: 600, color: 'text.primary' }}>
                        U-Probe Assistant
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                        I can help you design probes, optimize parameters, and answer questions
                      </Typography>
                    </Box>
                  </Box>
                ) : (
                  <>
                    {messages.map(renderMessage)}
                    {isLoading &&
                      !messages.some((m) => m.sender === 'assistant' && m.id.startsWith('pending-')) && (
                      <Box sx={{ display: 'flex', justifyContent: 'flex-start', mb: 2, alignItems: 'flex-start' }}>
                        <Avatar
                          sx={{
                            bgcolor: theme.palette.secondary.main,
                            mx: 1,
                            width: 28,
                            height: 28
                          }}
                        >
                          <SmartToy sx={{ fontSize: 16 }} />
                        </Avatar>
                        <Paper
                          elevation={0}
                          sx={{
                            py: 1.25,
                            px: 1.75,
                            backgroundColor: 'background.paper',
                            borderRadius: 2,
                            border: '1px solid',
                            borderColor: 'divider',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1.5
                          }}
                        >
                          <CircularProgress size={14} thickness={4} sx={{ color: 'text.secondary' }} />
                          <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
                            Thinking...
                          </Typography>
                        </Paper>
                        <Box 
                          sx={{ 
                            ml: 0.5,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 0.25,
                            opacity: 1,
                            transition: 'opacity 0.2s ease'
                          }}
                        >
                          <Tooltip title="Cancel" placement="right">
                            <IconButton
                              size="small"
                              sx={{ 
                                width: 24,
                                height: 24,
                                color: 'error.main',
                                '&:hover': { 
                                  color: 'error.dark', 
                                  backgroundColor: 'rgba(239, 68, 68, 0.08)' 
                                }
                              }}
                              onClick={handleCancelRequest}
                            >
                              <Close sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </Box>
                    )}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </Box>

              {/* Input Area */}
              <Box
                sx={{
                  px: 3,
                  py: 2,
                  borderTop: '1px solid',
                  borderColor: 'divider',
                  backgroundColor: 'background.paper'
                }}
              >
                {/* Attachments Display - Modern Card Style */}
                {currentAttachments.length > 0 && (
                  <Box sx={{ mb: 1.5 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', mb: 0.75, display: 'block', fontWeight: 600, fontSize: '0.75rem' }}>
                      {currentAttachments.length} file{currentAttachments.length > 1 ? 's' : ''}
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      {currentAttachments.map(att => (
                        <Box 
                          key={att.id}
                          sx={{ 
                            display: 'flex',
                            alignItems: 'center',
                            py: 0.75,
                            px: 1.25,
                            border: '1px solid',
                            borderColor: 'divider',
                            borderRadius: 1.5,
                            backgroundColor: 'background.default',
                            transition: 'all 0.15s ease',
                            '&:hover': {
                              borderColor: theme.palette.primary.main,
                              backgroundColor: 'action.hover'
                            }
                          }}
                        >
                          <InsertDriveFile sx={{ fontSize: 16, color: theme.palette.primary.main, mr: 0.75 }} />
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              fontWeight: 500,
                              fontSize: '0.8125rem',
                              color: 'text.primary',
                              maxWidth: 150,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {att.filename}
                          </Typography>
                            <IconButton 
                              size="small" 
                              onClick={() => handleRemoveAttachment(att.id)}
                              sx={{ 
                                ml: 0.5,
                                width: 20,
                                height: 20,
                                color: 'text.secondary',
                                '&:hover': { 
                                  color: 'error.main',
                                  backgroundColor: 'rgba(239, 68, 68, 0.08)'
                                }
                              }}
                            >
                            <Close sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                )}

                {/* Upload Progress Indicators */}
                {Object.keys(uploadProgress).length > 0 && (
                  <Box sx={{ mb: 2 }}>
                    {Object.entries(uploadProgress).map(([id, progress]) => (
                      <Box key={id} sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                        <CircularProgress size={20} variant="determinate" value={progress} />
                        <Typography variant="caption" color="text.secondary">
                          Uploading... {progress}%
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                )}

                <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
                  <TextField
                    ref={inputRef}
                    multiline
                    maxRows={6}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder={hasAgentConfiguration ? "Message U-Probe Assistant..." : "Please configure Agent model and API key first..."}
                    disabled={isLoading}
                    onClick={() => {
                      if (!hasAgentConfiguration) {
                        openApiKeyDialog();
                        setSnackbar({ open: true, message: 'Please configure Agent model and API key first', severity: 'warning' });
                      }
                    }}
                    InputProps={{
                      readOnly: !hasAgentConfiguration,
                    }}
                    variant="outlined"
                    sx={{
                      flex: 1,
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 2,
                        backgroundColor: 'background.default',
                        fontSize: '0.9375rem',
                        paddingY: 0.75,
                        transition: 'all 0.15s ease',
                        '&.Mui-focused': {
                          boxShadow: `0 0 0 2px ${alpha(theme.palette.primary.main, 0.15)}`,
                          '& fieldset': {
                            borderColor: theme.palette.primary.main,
                            borderWidth: 1.5
                          }
                        }
                      }
                    }}
                  />
                  <Box sx={{ display: 'flex', gap: 0.75 }}>
                    <Tooltip title="Attach">
                      <IconButton
                        size="medium"
                        disabled={isLoading}
                        sx={{
                          width: 40,
                          height: 40,
                          color: 'text.secondary',
                          backgroundColor: 'background.paper',
                          border: '1px solid',
                          borderColor: 'divider',
                          borderRadius: 1.5,
                          transition: 'all 0.15s ease',
                          '&:hover': {
                            backgroundColor: 'action.hover',
                            borderColor: theme.palette.primary.main,
                            color: theme.palette.primary.main
                          },
                          '&:disabled': {
                            color: 'text.disabled',
                            backgroundColor: 'action.disabledBackground'
                          }
                        }}
                        onClick={handleChooseFiles}
                      >
                        <Attachment fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <input ref={fileInputRef} type="file" style={{ display: 'none' }} multiple onChange={handleFilesSelected} />
                    <Button
                      variant="contained"
                      onClick={handleSendMessage}
                      disabled={isLoading || (hasAgentConfiguration && !inputValue.trim())}
                      sx={{
                        minWidth: 40,
                        width: 40,
                        height: 40,
                        borderRadius: 1.5,
                        background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
                        boxShadow: 'none',
                        transition: 'all 0.15s ease',
                        '&:hover': {
                          boxShadow: `0 2px 8px ${alpha(theme.palette.primary.main, 0.3)}`
                        },
                        '&:disabled': {
                          background: theme.palette.action.disabledBackground,
                          color: theme.palette.text.disabled
                        }
                      }}
                    >
                      <Send fontSize="small" />
                    </Button>
                  </Box>
                </Box>
              </Box>
          </Box>
      </Box>
      {/* API Key Configuration Dialog */}
      <Dialog
        open={artifactPreview.open}
        onClose={closeArtifactPreview}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            <InsertDriveFile />
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
                {artifactPreview.artifact ? artifactTitle(artifactPreview.artifact) : 'File preview'}
              </Typography>
              {artifactPreview.artifact ? (
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {artifactPreview.artifact.path.replace(/\\/g, '/').split('/').pop()}
                </Typography>
              ) : null}
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent dividers sx={{ minHeight: 320 }}>
          {artifactPreview.loading ? (
            <Box sx={{ minHeight: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
              <CircularProgress size={18} />
              <Typography variant="body2" color="text.secondary">Loading preview…</Typography>
            </Box>
          ) : artifactPreview.imageUrl ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', bgcolor: 'action.hover', borderRadius: 2, p: 2 }}>
              <Box
                component="img"
                src={artifactPreview.imageUrl}
                alt={artifactPreview.artifact?.label || 'preview'}
                sx={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }}
              />
            </Box>
          ) : artifactPreview.rows && artifactPreview.rows.length > 0 ? (
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: '65vh' }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    {(artifactPreview.rows[0] || []).map((cell, idx) => (
                      <TableCell key={idx} sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>
                        {cell || `Column ${idx + 1}`}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {artifactPreview.rows.slice(1).map((row, rowIdx) => (
                    <TableRow key={rowIdx} hover>
                      {(artifactPreview.rows?.[0] || []).map((_, cellIdx) => (
                        <TableCell key={cellIdx} sx={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row[cellIdx] ?? ''}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Paper variant="outlined" sx={{ bgcolor: theme.palette.mode === 'dark' ? '#0f172a' : '#f8fafc', color: theme.palette.mode === 'dark' ? '#e2e8f0' : '#0f172a', borderColor: theme.palette.mode === 'dark' ? '#1e293b' : 'divider', borderRadius: 2, overflow: 'hidden' }}>
              <Box sx={{ px: 1.5, py: 0.75, bgcolor: theme.palette.mode === 'dark' ? '#1e293b' : 'grey.100', borderBottom: '1px solid', borderColor: theme.palette.mode === 'dark' ? '#334155' : 'divider', display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" sx={{ color: theme.palette.mode === 'dark' ? '#94a3b8' : 'text.secondary', fontWeight: 700 }}>
                  {artifactPreview.artifact ? artifactTypeLabel(artifactPreview.artifact) : 'TEXT'}
                </Typography>
                {artifactPreview.truncated ? (
                  <Typography variant="caption" sx={{ color: 'warning.main' }}>
                    Preview truncated
                  </Typography>
                ) : null}
              </Box>
              <Box sx={{ p: 1.5, maxHeight: '65vh', overflow: 'auto' }}>
                <pre style={{ margin: 0, fontFamily: '"JetBrains Mono", Monaco, Menlo, Consolas, monospace', fontSize: '0.82rem', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                  {artifactPreview.text || 'No preview content available.'}
                </pre>
              </Box>
            </Paper>
          )}
        </DialogContent>
        <DialogActions>
          {artifactPreview.artifact ? (
            <>
              {artifactPreview.text ? (
                <Button
                  startIcon={<ContentCopy />}
                  onClick={() => navigator.clipboard?.writeText(artifactPreview.text || '')}
                >
                  Copy
                </Button>
              ) : null}
              <Button
                startIcon={<FileDownload />}
                onClick={() => {
                  if (!artifactPreview.artifact) return;
                  const href = apiPublicHref(buildArtifactUrl(artifactPreview.artifact.path));
                  const fname = artifactPreview.artifact.path.replace(/\\/g, '/').split('/').pop() || 'artifact';
                  void triggerAuthenticatedArtifactDownload(href, fname);
                }}
              >
                Download
              </Button>
            </>
          ) : null}
          <Button onClick={closeArtifactPreview}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={showApiKeyDialog}
        onClose={closeApiKeyDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Settings />
            <Typography variant="h6">Agent Configuration</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="API Key"
              type="password"
              fullWidth
              value={tempApiKey}
              onChange={(e) => setTempApiKey(e.target.value)}
              placeholder="Required for this page session"
              helperText="Required. Saved only in this browser localStorage and sent with each agent request; it is not saved by the backend."
            />
            <TextField
              label="Model"
              fullWidth
              value={tempModel}
              onChange={(e) => setTempModel(e.target.value)}
              placeholder="Required, e.g. gemini/gemini-3-flash-preview"
              helperText="Required. Saved only in this browser localStorage and sent with each agent request so users keep isolated model settings."
            />
            <TextField
              label="Proxy (Optional)"
              fullWidth
              value={tempProxy}
              onChange={(e) => setTempProxy(e.target.value)}
              placeholder="http://127.0.0.1:7890"
              helperText="Optional. Must start with http:// or https://, e.g. http://127.0.0.1:7890. With auth: http://user:pass@host:port"
            />
            <Alert severity="info">
              Configuration is saved only in this browser for convenience. The backend receives it per request and does not persist user credentials.
            </Alert>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClearAgentConfig}>Clear</Button>
          <Button onClick={closeApiKeyDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSaveApiKey}
            sx={{
              background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`
            }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={
          snackbar.severity === 'error' ? 16000 :
          snackbar.severity === 'warning' ? 8000 : 4000
        }
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{
            width: '100%',
            maxWidth: 'min(92vw, 560px)',
            '& .MuiAlert-message': { width: '100%', wordBreak: 'break-word', whiteSpace: 'pre-wrap' },
          }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Agent;
