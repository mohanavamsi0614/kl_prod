import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Mail, Star, Trash2, RefreshCw, Search, Link as LinkIcon, X, CheckCircle, Inbox, ArrowLeft, CornerUpLeft, Send, MoreVertical, Paperclip, ExternalLink, File, Download, AlertCircle, LogOut, Calendar } from 'lucide-react';
import { api } from '../../lib/api';
import DateRangePicker from '../../components/DateRangePicker';
import ProductivityLoader from '../../components/ui/ProductivityLoader';
import ProductivitySpinner from '../../components/ui/ProductivitySpinner';
import type { Email, CalendarCategory, ApiConnection } from '../../types';

interface Attachment {
    id: string;
    filename: string;
    mimeType: string;
    size: number;
}

interface ExtendedEmail extends Email {
    body?: string;
    attachments?: Attachment[];
    accountId?: string;
    category?: string;
    accountColor?: string;
}

// Helper function to extract email address from "Name <email>" format
const extractEmailAddress = (emailString: string): string => {
    const match = emailString.match(/<([^>]+)>/);
    return match ? match[1] : emailString;
};

// Helper function to replace cid: URLs with data: URLs for inline images
const replaceInlineImages = (htmlBody: string, inlineAttachments?: Array<{ contentId: string; dataUrl: string }>): string => {
    if (!inlineAttachments || inlineAttachments.length === 0) {
        return htmlBody;
    }

    let processedBody = htmlBody;
    
    // Replace each cid: URL with its corresponding data URL
    for (const attachment of inlineAttachments) {
        // Clean contentId (remove < > if present in the attachment object, though backend should have done it)
        const cleanId = attachment.contentId.replace(/^<|>$/g, '');
        
        // Match cid:ID, cid:"ID", cid:'ID'
        // Also handle cases where ID might be URL encoded or have different casing
        const escapedId = cleanId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // Regex to match cid: followed by the ID, allowing for optional quotes
        const cidRegex = new RegExp(`src=["']cid:${escapedId}["']`, 'gi');
        
        // Replace with data URL
        processedBody = processedBody.replace(cidRegex, `src="${attachment.dataUrl}"`);
        
        // Fallback: Try replacing just the cid: part if it's not in a standard src attribute (less safe but covers edge cases)
        const rawCidRegex = new RegExp(`cid:${escapedId}`, 'gi');
        processedBody = processedBody.replace(rawCidRegex, attachment.dataUrl);
    }

    return processedBody;
};

const EmailPage: React.FC = () => {
  // Helper function to derive color from category
  const getCategoryColor = (category: CalendarCategory): string => {
    switch(category) {
      case 'Work': return 'bg-violet-500';
      case 'Personal': return 'bg-productivity-500';
      case 'Family': return 'bg-emerald-500';
      default: return 'bg-slate-500';
    }
  };

  const [emails, setEmails] = useState<ExtendedEmail[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterUnread, setFilterUnread] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<ExtendedEmail | null>(null);
  
  // Pagination State: Map accountId -> nextPageToken
  const [nextPageTokens, setNextPageTokens] = useState<Record<string, string | null>>({});
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [prefetchedData, setPrefetchedData] = useState<{ messages: ExtendedEmail[], tokens: Record<string, string | null> } | null>(null);
  
  // Category Filter State
  const [selectedCategories, setSelectedCategories] = useState<CalendarCategory[]>(['Personal', 'Work', 'Family', 'Other']);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Date Range Filter State
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  // Compose state
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [isSendingCompose, setIsSendingCompose] = useState(false);
  const [composeSender, setComposeSender] = useState<string | null>(null);
  const [showEmailSuggestions, setShowEmailSuggestions] = useState(false);

  // Reply state
  const [replyText, setReplyText] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Account State
  const [accounts, setAccounts] = useState<any[]>([]);

  // Sync interval state (configurable from server)
  const [syncIntervalMs, setSyncIntervalMs] = useState(60000); // Default 60s

  // Modal State
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [linkProvider, setLinkProvider] = useState('Gmail');
  const [linkCategory, setLinkCategory] = useState<CalendarCategory>('Personal');

  // Inline Notification State
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  // Attachment Modal State
  const [attachmentModalEmail, setAttachmentModalEmail] = useState<ExtendedEmail | null>(null);

  // Handle Escape key for modals
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (attachmentModalEmail) {
          setAttachmentModalEmail(null);
        } else if (isLinkModalOpen) {
          setIsLinkModalOpen(false);
        } else if (isComposeOpen) {
          setIsComposeOpen(false);
        }
      }
    };

    if (attachmentModalEmail || isLinkModalOpen || isComposeOpen) {
      document.addEventListener('keydown', handleEscape);
      // Trap focus within modal
      document.body.style.overflow = 'hidden';
      return () => {
        document.removeEventListener('keydown', handleEscape);
        document.body.style.overflow = 'unset';
      };
    }
  }, [attachmentModalEmail, isLinkModalOpen, isComposeOpen]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const showNotification = (message: string, type: 'success' | 'error') => {
      setNotification({ message, type });
  };

  const fetchData = async (reset = true, tokensOverride?: Record<string, string | null>, isPrefetch = false, isAutoSync = false) => {
      if (!isPrefetch && !isAutoSync) {
          if (reset) {
              setIsLoading(true);
              setError(null);
          } else {
              setIsLoadingMore(true);
          }
      }
      
      // Add timeout protection to prevent infinite loading
      const loadingTimeout = setTimeout(() => {
          if (!isPrefetch && !isAutoSync) {
              setIsLoading(false);
              setIsLoadingMore(false);
              setIsLinking(false);
              if (emails.length === 0) {
                  setError("Request timed out. Please try again.");
              }
          }
      }, 30000); // 30 second timeout

      try {
          // 1. Fetch Connections (always refresh on reset)
          let currentAccounts = accounts;
          if (reset) {
              const connections = await api.get<ApiConnection[]>('/api/connections');
              currentAccounts = connections
                  .filter(c => c.service === 'GMAIL' || c.service === 'OUTLOOK')
                  .map(c => ({
                      id: c.id,
                      provider: c.service === 'GMAIL' ? 'Gmail' : 'Outlook',
                      address: c.accountEmail,
                      connected: true,
                      category: c.category || 'Personal',
                      color: getCategoryColor((c.category as CalendarCategory) || 'Personal')
                  }));
              setAccounts(currentAccounts);
          }

          // 2. Determine which accounts to fetch from
          const targetAccounts = selectedAccountId 
              ? currentAccounts.filter(a => a.id === selectedAccountId)
              : currentAccounts;

          if (targetAccounts.length > 0) {
              const tokensToUse = tokensOverride || nextPageTokens;
              
              // Fetch from all target accounts in parallel
              const results = await Promise.all(targetAccounts.map(async (account) => {
                  // If loading more, use the token for this account. If no token and not reset, skip.
                  const token = reset ? undefined : tokensToUse[account.id];
                  if (!reset && !token && tokensToUse[account.id] === null) {
                      // No more pages for this account
                      return { messages: [], nextPageToken: null, accountId: account.id };
                  }

                  const queryParams = new URLSearchParams();
                  queryParams.append('accountId', account.id);
                  if (token) queryParams.append('pageToken', token);
                  
                  // Build Gmail query string for server-side filtering
                  const queryParts: string[] = [];
                  if (filterUnread) queryParts.push('is:unread');
                  if (debouncedSearchQuery.trim()) {
                      // Search across subject, from, and body
                      const searchTerm = debouncedSearchQuery.trim();
                      queryParts.push(`{subject:${searchTerm} from:${searchTerm} ${searchTerm}}`);
                  }
                  if (startDate) {
                      // Gmail uses after:YYYY/MM/DD format
                      const formattedStart = startDate.replace(/-/g, '/');
                      queryParts.push(`after:${formattedStart}`);
                  }
                  if (endDate) {
                      // Gmail uses before:YYYY/MM/DD format
                      const formattedEnd = endDate.replace(/-/g, '/');
                      queryParts.push(`before:${formattedEnd}`);
                  }
                  if (queryParts.length > 0) {
                      queryParams.append('q', queryParts.join(' '));
                  }

                  try {
                      const endpoint = account.provider === 'Gmail' ? '/api/gmail' : '/api/outlook';
                      const res = await api.get<{ messages: any[], nextPageToken?: string }>(`${endpoint}/fetch?${queryParams.toString()}`);
                      return { 
                          messages: res.messages || [], 
                          nextPageToken: res.nextPageToken || null,
                          accountId: account.id 
                      };
                  } catch (e: any) {
                      console.error(`Failed to fetch for account ${account.id}`, e);
                      // Check if it's an auth error that requires reconnection
                      const errorMessage = e?.message || e?.error || '';
                      if (errorMessage.includes('reconnect') || errorMessage.includes('expired') || errorMessage.includes('revoked')) {
                          showNotification(`Account ${account.address} needs to be reconnected`, 'error');
                      }
                      return { messages: [], nextPageToken: null, accountId: account.id, error: true };
                  }
              }));

              // Merge and Process Messages
              let allNewEmails: ExtendedEmail[] = [];
              const newTokens: Record<string, string | null> = { ...tokensToUse };

              results.forEach(res => {
                  const account = currentAccounts.find(a => a.id === res.accountId);
                  const mapped: ExtendedEmail[] = res.messages.map((msg: any) => ({
                      id: msg.id,
                      read: msg.read, 
                      subject: msg.subject,
                      from: msg.from,
                      date: msg.date,
                      preview: msg.snippet,
                      body: msg.body || msg.snippet,
                      attachments: msg.attachments || [],
                      inlineAttachments: msg.inlineAttachments || [],
                      accountId: res.accountId,
                      provider: account?.provider,
                      category: account?.category,
                      accountColor: account?.color
                  }));
                  allNewEmails = [...allNewEmails, ...mapped];
                  
                  // Update token for this account
                  if (reset) {
                      newTokens[res.accountId] = res.nextPageToken;
                  } else {
                      // Only update if we actually tried to fetch (which we did if we are here)
                      newTokens[res.accountId] = res.nextPageToken;
                  }
              });

              // Sort by date descending
              allNewEmails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

              if (isPrefetch) {
                  setPrefetchedData({ messages: allNewEmails, tokens: newTokens });
              } else {
                  if (reset) {
                      setEmails(allNewEmails);
                  } else {
                      setEmails(prev => [...prev, ...allNewEmails]);
                  }
                  
                  setNextPageTokens(newTokens);

                  // Trigger prefetch if any account has a next page
                  const hasMore = Object.values(newTokens).some(t => t !== null);
                  if (hasMore) {
                      setTimeout(() => {
                          fetchData(false, newTokens, true);
                      }, 100);
                  }
              }
          } else {
              if (!isPrefetch) {
                  setEmails([]);
                  setNextPageTokens({});
              }
          }

      } catch (err: any) {
          console.error(err);
          clearTimeout(loadingTimeout);
          if (!isPrefetch && err.message !== "Gmail not connected") {
             setError("Failed to load emails. Please try again.");
          }
      } finally {
          clearTimeout(loadingTimeout);
          if (!isPrefetch && !isAutoSync) {
              // Clear loading states immediately when data is ready
              setIsLoading(false);
              setIsLoadingMore(false);
              setIsSearching(false);
              setIsLinking(false);
          }
      }
  };

  // Debounce search query
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    if (searchQuery.trim() !== debouncedSearchQuery.trim()) {
      setIsSearching(true);
      searchTimeoutRef.current = setTimeout(() => {
        setDebouncedSearchQuery(searchQuery);
      }, 500);
    }
    
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  // Refetch when debounced search, start date, or end date changes
  useEffect(() => {
    fetchData(true);
  }, [debouncedSearchQuery, startDate, endDate]);

  useEffect(() => {
    // Check for auth param in URL (set after OAuth callback)
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === 'success') {
      // Clean up URL immediately
      window.history.replaceState({}, '', window.location.pathname);
      
      // Set linking and initial load state
      setIsLinking(true);
      showNotification("Connecting email account...", "success");
      
      // Retry fetching data until we get accounts or max retries
      let retries = 0;
      const maxRetries = 3; // Reduced from 5 - with cache clearing, should be faster
      const retryDelay = 200; // Reduced from 800ms - check more frequently
      
      const attemptFetch = async () => {
        try {
          const connections = await api.get<ApiConnection[]>('/api/connections');
          const hasEmail = connections.some(c => c.service === 'GMAIL' || c.service === 'OUTLOOK');
          
          if (hasEmail || retries >= maxRetries) {
            await fetchData(true);
            // Don't clear isLinking here - let fetchData handle it with proper timing
            if (hasGmail) {
              showNotification("Email account linked successfully!", "success");
            }
          } else {
            retries++;
            setTimeout(attemptFetch, retryDelay);
          }
        } catch (err) {
          // If API fails, still try fetchData
          await fetchData(true);
          // Don't clear isLinking here - let fetchData handle it
        }
      };
      
      // Start immediately - backend now clears cache after OAuth
      attemptFetch();
    } else {
      fetchData(true);
    }
  }, []); // Run only once on mount

  // Fetch sync intervals from config
  useEffect(() => {
    const fetchSyncConfig = async () => {
      try {
        const config = await api.get<{
          gmail: { intervalMs: number };
        }>('/api/config/sync-intervals');
        setSyncIntervalMs(config.gmail.intervalMs);
      } catch (err) {
        console.warn('Failed to fetch sync config, using default', err);
      }
    };
    fetchSyncConfig();
  }, []);

  useEffect(() => {
    fetchData(true);
  }, [selectedAccountId, filterUnread]); // Refetch when account or filter changes

  // Auto-sync using configured interval
  useEffect(() => {
    if (syncIntervalMs <= 0) return;
    
    const interval = setInterval(() => {
      fetchData(true, undefined, false, true); // Silent refresh
    }, syncIntervalMs);
    return () => clearInterval(interval);
  }, [selectedAccountId, filterUnread, syncIntervalMs]);

  const handleLoadMore = () => {
      if (prefetchedData) {
          // Use pre-fetched data
          setEmails(prev => [...prev, ...prefetchedData.messages]);
          setNextPageTokens(prefetchedData.tokens);
          const nextTokens = prefetchedData.tokens;
          setPrefetchedData(null);
          
          // Trigger next prefetch
          const hasMore = Object.values(nextTokens).some(t => t !== null);
          if (hasMore) {
              fetchData(false, nextTokens, true);
          }
      } else {
          // Fallback if no prefetch (shouldn't happen often)
          fetchData(false);
      }
  };

  const handleSendCompose = async () => {
      if (!composeTo || !composeSubject || !composeBody) return;
      
      setIsSendingCompose(true);
      try {
          const account = accounts.find(a => a.id === (composeSender || selectedAccountId));
          const endpoint = account?.provider === 'Outlook' ? '/api/outlook' : '/api/gmail';
          
          await api.post(`${endpoint}/send`, {
              to: composeTo,
              subject: composeSubject,
              body: composeBody,
              accountId: composeSender || undefined
          });
          
          showNotification('Email sent successfully!', 'success');
          setIsComposeOpen(false);
          setComposeTo('');
          setComposeSubject('');
          setComposeBody('');
          setComposeSender(null);
      } catch (err) {
          console.error(err);
          showNotification('Failed to send email', 'error');
      } finally {
          setIsSendingCompose(false);
      }
  };

  // Get unique email addresses from emails for autofill (memoized)
  const emailSuggestions = useMemo(() => {
      const emailSet = new Set<string>();
      emails.forEach(email => {
          // Extract email from "Name <email@example.com>" format
          const match = email.from.match(/<([^>]+)>/);
          if (match) {
              emailSet.add(match[1]);
          } else if (email.from.includes('@')) {
              emailSet.add(email.from.trim());
          }
      });
      return Array.from(emailSet);
  }, [emails]);

  const getEmailSuggestions = useCallback(() => {
      return emailSuggestions.filter(e => 
          e.toLowerCase().includes(composeTo.toLowerCase())
      ).slice(0, 5);
  }, [emailSuggestions, composeTo]);

  const handleMarkRead = async (id: string, accountId?: string) => {
    // Skip if email is already read
    const email = emails.find(e => e.id === id);
    if (email?.read) {
      return;
    }

    // Optimistic update
    setEmails(prev => prev.map(e => e.id === id ? { ...e, read: true } : e));
    
    // Also update selectedEmail if it's the same email
    if (selectedEmail?.id === id) {
      setSelectedEmail(prev => prev ? { ...prev, read: true } : null);
    }
    
    // Call backend to mark as read
    try {
      const account = accounts.find(a => a.id === accountId);
      const endpoint = account?.provider === 'Outlook' ? '/api/outlook' : '/api/gmail';
      
      const response = await api.post<{ success: boolean; messageId: string; read: boolean }>(`${endpoint}/mark-as-read`, {
        messageId: id,
        accountId: accountId || null
      });
      
      if (!response.success) {
        throw new Error('Failed to mark email as read');
      }
    } catch (error: any) {
      console.error('Failed to mark email as read:', error);
      // Revert optimistic update on error
      setEmails(prev => prev.map(e => e.id === id ? { ...e, read: false } : e));
      if (selectedEmail?.id === id) {
        setSelectedEmail(prev => prev ? { ...prev, read: false } : null);
      }
      
      // Show error notification for auth errors
      const errorMessage = error?.response?.data?.error || error?.message || '';
      if (errorMessage.includes('reconnect') || errorMessage.includes('expired')) {
        showNotification('Gmail session expired. Please reconnect your account.', 'error');
      }
    }
  };

  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const handleEmailClick = async (email: ExtendedEmail) => {
    // Don't mark as read immediately - only mark when closing the email view
    setSelectedEmail(email);
    setIsReplying(false);
    setReplyText('');

    // If it's Outlook and we don't have the body yet, fetch it
    if ((email as any).provider === 'Outlook' && !email.body) {
        setIsLoadingDetail(true);
        try {
            const detail = await api.get<any>(`/api/outlook/message/${email.id}?accountId=${email.accountId}`);
            setEmails(prev => prev.map(e => e.id === email.id ? { 
                ...e, 
                body: detail.body, 
                attachments: detail.attachments, 
                inlineAttachments: detail.inlineAttachments 
            } : e));
            setSelectedEmail(prev => prev && prev.id === email.id ? { 
                ...prev, 
                body: detail.body, 
                attachments: detail.attachments, 
                inlineAttachments: detail.inlineAttachments 
            } : prev);
        } catch (err) {
            console.error("Failed to fetch email detail", err);
            showNotification("Failed to load full email content", "error");
        } finally {
            setIsLoadingDetail(false);
        }
    }
  };

  const handleBackToList = () => {
    // Mark as read when closing the email view (if it was unread)
    if (selectedEmail && !selectedEmail.read) {
      const emailId = selectedEmail.id;
      const accountId = selectedEmail.accountId;
      
      // Optimistic update: immediately update local state
      setEmails(prev => prev.map(e => 
        e.id === emailId ? { ...e, read: true } : e
      ));
      
      // Then make API call (fire and forget with error handling)
      handleMarkRead(emailId, accountId);
    }
    setSelectedEmail(null);
    setReplyText('');
    setIsReplying(false);
  };

  const handleSendReply = async () => {
    if(!selectedEmail) return;
    
    setIsSending(true);
    try {
        const account = accounts.find(a => a.id === selectedEmail.accountId);
        const endpoint = account?.provider === 'Outlook' ? '/api/outlook' : '/api/gmail';

        await api.post(`${endpoint}/send`, {
            to: extractEmailAddress(selectedEmail.from), // Parse email from "Name <email>" format
            subject: `Re: ${selectedEmail.subject}`,
            body: replyText,
            accountId: selectedEmail.accountId
        });
        
        showNotification('Reply sent!', 'success');
        setReplyText('');
        setIsReplying(false);
    } catch (err) {
        console.error(err);
        showNotification('Failed to send reply', 'error');
    } finally {
        setIsSending(false);
    }
  };

  const handleDownloadAttachment = (accountId: string, messageId: string, attachment: Attachment) => {
      const account = accounts.find(a => a.id === accountId);
      const provider = account?.provider === 'Outlook' ? 'outlook' : 'gmail';
      
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const encodedFilename = encodeURIComponent(attachment.filename);
      const encodedMimeType = encodeURIComponent(attachment.mimeType);
      const url = `${apiUrl}/api/${provider}/attachment/${accountId}/${messageId}/${attachment.id}?filename=${encodedFilename}&mimeType=${encodedMimeType}`;
      window.open(url, '_blank');
  };

  const handleLinkAccount = () => {
    if (linkProvider === 'Gmail') {
        // Redirect to backend auth with category
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
        window.location.href = `${apiUrl}/auth/google?service=GMAIL&category=${linkCategory}`;
        return;
    }

    if (linkProvider === 'Outlook') {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
        window.location.href = `${apiUrl}/auth/microsoft?service=MAIL&category=${linkCategory}`;
        return;
    }

    // Mock for others
    // Determine color based on category to match Calendar logic
    const color = getCategoryColor(linkCategory);
    
    const newAccount = {
        id: Math.random().toString(36).substr(2, 9),
        provider: linkProvider,
        address: `user@${linkProvider.toLowerCase().replace(/\s/g, '')}.com`,
        connected: true,
        category: linkCategory,
        color
    };

    setAccounts([...accounts, newAccount]);
    setIsLinkModalOpen(false);
    // Reset defaults
    setLinkProvider('Gmail');
    setLinkCategory('Personal');
  };

  const handleDisconnect = async (connectionId: string) => {
    try {
      await api.delete(`/api/connections/${connectionId}`);
      setAccounts(prev => prev.filter(a => a.id !== connectionId));
      if (selectedAccountId === connectionId) {
        setSelectedAccountId(null);
      }
      showNotification('Account disconnected successfully', 'success');
      fetchData(true); // Refresh data
    } catch (err) {
      console.error('Failed to disconnect:', err);
      showNotification('Failed to disconnect account', 'error');
    }
  };

  // Memoized filtered emails for better performance
  // Note: Search is now server-side, so we only filter by category here
  const filteredEmails = useMemo(() => {
    return emails.filter(email => {
      // Filter by Category (client-side, for multi-account category views)
      if (email.category && !selectedCategories.includes(email.category as CalendarCategory)) return false;
      
      return true;
    });
  }, [emails, selectedCategories]);

  const unreadCount = emails.filter(e => !e.read).length;
  const hasMore = Object.values(nextPageTokens).some(t => t !== null);

  const toggleCategory = (category: CalendarCategory) => {
      if (selectedCategories.includes(category)) {
          setSelectedCategories(prev => prev.filter(c => c !== category));
      } else {
          setSelectedCategories(prev => [...prev, category]);
      }
  };

  return (
    <div className="p-4 md:p-6 lg:p-10 h-full overflow-y-auto relative">
      <style>{`
        .prose a {
            color: #2563eb;
            text-decoration: underline;
        }
        .dark .prose a {
            color: #60a5fa;
        }
      `}</style>

      {/* Inline Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 z-[100] p-4 rounded-xl flex items-center gap-3 shadow-lg animate-in slide-in-from-top-2 ${
            notification.type === 'success' 
            ? 'bg-green-50 dark:bg-green-900/20 text-green-900 dark:text-green-200 border border-green-200 dark:border-green-800' 
            : 'bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-200 border border-red-200 dark:border-red-800'
        }`}>
           {notification.type === 'success' ? <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" /> : <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />}
           <p className="font-medium">{notification.message}</p>
           <button onClick={() => setNotification(null)} className="ml-2 p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors">
               <X className="w-4 h-4" />
           </button>
        </div>
      )}

      <header className="mb-4 md:mb-6 flex flex-col gap-4">
        <div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-1">Email</h1>
            <p className="text-xs sm:text-sm md:text-base text-slate-500 dark:text-slate-400">Unified inbox for all your accounts.</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:justify-between gap-3">
             {/* Search Input with Loading Indicator */}
             <div className="relative order-last sm:order-first flex-1 sm:flex-none">
                {isSearching ? (
                    <ProductivitySpinner size="sm" className="absolute left-3 top-1/2 -translate-y-1/2" />
                ) : (
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                )}
                <input 
                    type="text" 
                    placeholder="Search by subject, sender, or content..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full sm:w-80 pl-9 pr-4 py-2.5 sm:py-2 rounded-xl bg-white dark:bg-dark-surface border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-productivity-500/50"
                />
             </div>
             
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Date Range Filter Button */}
              <button
                onClick={() => setIsDatePickerOpen(true)}
                className="flex-1 sm:flex-none bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 px-3 sm:px-4 py-2.5 sm:py-2 rounded-xl flex items-center justify-center sm:justify-start gap-2 transition-colors shadow-sm text-xs sm:text-sm font-medium relative group"
                title="Select date range"
              >
                <Calendar className="w-4 h-4 text-slate-500 dark:text-slate-400 flex-shrink-0" />
                {startDate || endDate ? (
                  <span className="hidden sm:inline text-xs truncate max-w-40">
                    {startDate && endDate 
                      ? `${new Date(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                      : startDate 
                      ? `From ${new Date(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                      : `Until ${new Date(endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                    }
                  </span>
                ) : (
                  <span className="hidden sm:inline">Filter by date</span>
                )}
              </button>

              {/* Sync Button */}
              {accounts.length > 0 && (
                <button 
                  onClick={async () => {
                    setIsSyncing(true);
                    try {
                      await fetchData(true);
                      showNotification('Emails synced!', 'success');
                    } catch (err) {
                      showNotification('Sync failed', 'error');
                    } finally {
                      setIsSyncing(false);
                    }
                  }}
                  disabled={isSyncing}
                  className="flex-1 sm:flex-none bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 px-3 sm:px-4 py-2.5 sm:py-2 rounded-xl flex items-center justify-center sm:justify-start gap-2 transition-colors shadow-sm text-xs sm:text-sm font-medium"
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-productivity-500' : 'text-slate-500 dark:text-slate-400'} flex-shrink-0`} />
                  <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : 'Sync'}</span>
                </button>
              )}

              <button 
                onClick={() => setIsLinkModalOpen(true)}
                className="flex-1 sm:flex-none bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 px-3 sm:px-4 py-2.5 sm:py-2 rounded-xl flex items-center justify-center sm:justify-start gap-2 transition-colors shadow-sm text-xs sm:text-sm font-medium"
              >
                <LinkIcon className="w-4 h-4 text-slate-500 dark:text-slate-400 flex-shrink-0" />
                <span className="hidden sm:inline">Link Email</span>
              </button>

              <button 
                  onClick={() => setIsComposeOpen(true)}
                  className="flex-1 sm:flex-none bg-productivity-600 hover:bg-productivity-500 text-white px-3 sm:px-4 py-2.5 sm:py-2 rounded-xl flex items-center justify-center sm:justify-start gap-2 transition-colors shadow-lg shadow-productivity-500/20 text-xs sm:text-sm font-medium">
                  <Mail className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden sm:inline">Compose</span>
              </button>
            </div>
        </div>
      </header>

      {/* Mobile Account Selector (Visible only on small screens) */}
      <div className="lg:hidden mb-4 overflow-x-auto pb-2 flex gap-2 no-scrollbar">
          <button 
              onClick={() => setSelectedAccountId(null)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap border transition-colors ${
                  selectedAccountId === null 
                  ? 'bg-productivity-600 text-white border-productivity-600' 
                  : 'bg-white dark:bg-dark-surface text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
              }`}
          >
              <Inbox className="w-4 h-4" /> All Inboxes
          </button>
          {accounts.map(account => (
              <button 
                  key={account.id}
                  onClick={() => setSelectedAccountId(account.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap border transition-colors ${
                      selectedAccountId === account.id
                      ? 'bg-slate-800 dark:bg-white text-white dark:text-slate-900 border-slate-800 dark:border-white' 
                      : 'bg-white dark:bg-dark-surface text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
              >
                  <div className={`w-2 h-2 rounded-full ${account.color}`}></div>
                  {account.provider}
              </button>
          ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 md:gap-6 h-[calc(100%-140px)] md:h-[calc(100%-120px)]">
        {/* Sidebar / Accounts (Desktop) */}
        <div className="lg:col-span-1 hidden lg:block">
            <div className="bg-white dark:bg-dark-surface rounded-2xl border border-slate-200 dark:border-dark-border p-3 md:p-4 h-full flex flex-col overflow-y-auto">
                
                {/* Primary View: All Inboxes */}
                <button 
                    onClick={() => setSelectedAccountId(null)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl mb-1 transition-all duration-200 ${
                        selectedAccountId === null 
                        ? 'bg-productivity-600 text-white shadow-md shadow-productivity-500/20' 
                        : 'bg-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                >
                     <div className="flex items-center gap-3">
                          <Inbox className={`w-5 h-5 ${selectedAccountId === null ? 'text-white' : 'text-slate-400'}`} />
                          <span className="font-semibold">All Inboxes</span>
                     </div>
                     {unreadCount > 0 && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            selectedAccountId === null 
                            ? 'bg-white/20 text-white' 
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                        }`}>
                            {unreadCount}
                        </span>
                     )}
                </button>

                <div className="my-3 border-t border-slate-100 dark:border-slate-800 mx-2" />
                
                <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 px-2 md:px-3 text-[10px] md:text-xs">Categories</h3>
                <div className="space-y-1 px-2 md:px-3 mb-4">
                    {['Personal', 'Work', 'Family', 'Other'].map((cat) => (
                        <label key={cat} className="flex items-center gap-2 cursor-pointer py-1 group">
                            <div className={`w-3.5 h-3.5 md:w-4 md:h-4 rounded border flex items-center justify-center transition-colors ${
                                selectedCategories.includes(cat as CalendarCategory)
                                ? 'bg-productivity-500 border-productivity-500'
                                : 'border-slate-300 dark:border-slate-600 group-hover:border-productivity-400'
                            }`}>
                                {selectedCategories.includes(cat as CalendarCategory) && <CheckCircle className="w-2.5 h-2.5 md:w-3 md:h-3 text-white" />}
                            </div>
                            <input 
                                type="checkbox" 
                                className="hidden"
                                checked={selectedCategories.includes(cat as CalendarCategory)}
                                onChange={() => toggleCategory(cat as CalendarCategory)}
                            />
                            <span className="text-xs md:text-sm text-slate-600 dark:text-slate-300 truncate">{cat}</span>
                        </label>
                    ))}
                </div>

                <div className="my-3 border-t border-slate-100 dark:border-slate-800 mx-2" />
                
                <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 px-2 md:px-3 text-[10px] md:text-xs">Connected Accounts</h3>
                
                <div className="space-y-0.5 md:space-y-1 flex-1 pr-0.5 md:pr-1 min-h-0">
                    {accounts.map((account) => {
                        const isSelected = selectedAccountId === account.id;
                        return (
                            <div key={account.id} className="flex items-center gap-1">
                                <button 
                                    onClick={() => setSelectedAccountId(account.id)}
                                    className={`flex-1 flex items-center justify-between p-2 md:p-2.5 rounded-xl transition-all duration-200 min-w-0 ${
                                        isSelected 
                                        ? 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white' 
                                        : 'bg-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                    }`}
                                >
                                    <div className="flex items-center gap-2 md:gap-3 truncate">
                                        <div className={`w-2 h-2 md:w-2.5 md:h-2.5 rounded-full shrink-0 ${account.color} ring-2 ring-white dark:ring-slate-800`}></div>
                                        <div className="flex flex-col items-start truncate min-w-0">
                                            <span className={`truncate text-xs md:text-sm ${isSelected ? 'font-semibold' : 'font-medium'}`}>{account.address}</span>
                                            <span className="text-[8px] md:text-[10px] text-slate-400 uppercase tracking-wider">{account.category}</span>
                                        </div>
                                    </div>
                                </button>
                                <a 
                                    href="https://mail.google.com" 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="p-1.5 md:p-2 text-slate-400 hover:text-productivity-600 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors flex-shrink-0"
                                    title="Open Gmail"
                                >
                                    <ExternalLink className="w-3 h-3 md:w-4 md:h-4" />
                                </a>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDisconnect(account.id);
                                    }}
                                    className="p-1.5 md:p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors flex-shrink-0"
                                    title="Disconnect Account"
                                >
                                    <LogOut className="w-3 h-3 md:w-4 md:h-4" />
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>

        {/* Content Area (List or Detail) */}
        <div className="col-span-1 lg:col-span-3 h-full overflow-hidden">
            <div className="bg-white dark:bg-dark-surface rounded-xl md:rounded-2xl border border-slate-200 dark:border-dark-border h-full flex flex-col">
                
                {/* If Email Selected -> Show Detail View */}
                {selectedEmail ? (
                    <div className="flex flex-col h-full animate-in slide-in-from-right-4 duration-200">
                        {/* Detail Header */}
                        <div className="p-3 md:p-4 border-b border-slate-200 dark:border-dark-border flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/30 shrink-0">
                             <div className="flex items-center gap-2 md:gap-3 min-w-0">
                                <button 
                                    onClick={handleBackToList}
                                    className="p-1.5 md:p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-500 flex-shrink-0"
                                >
                                    <ArrowLeft className="w-4 h-4 md:w-5 md:h-5" />
                                </button>
                                <div className="hidden sm:flex items-center gap-2 text-slate-400 min-w-0">
                                    <Inbox className="w-3 h-3 md:w-4 md:h-4 flex-shrink-0" />
                                    <span className="text-xs md:text-sm">/</span >
                                    <span className="text-xs md:text-sm font-medium text-slate-600 dark:text-slate-300 truncate">Inbox</span>
                                </div>
                             </div>
                             <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
                                 <button className="p-1.5 md:p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"><Star className="w-4 h-4 md:w-5 md:h-5" /></button>
                                 <button className="p-1.5 md:p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"><Trash2 className="w-4 h-4 md:w-5 md:h-5" /></button>
                                 <button className="p-1.5 md:p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"><MoreVertical className="w-4 h-4 md:w-5 md:h-5" /></button>
                             </div>
                        </div>

                        {/* Detail Body */}
                        <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
                             <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-6 gap-2">
                                 <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white leading-tight">{selectedEmail.subject}</h2>
                                 <span className="text-xs sm:text-sm text-slate-500 whitespace-nowrap">{selectedEmail.date}</span>
                             </div>

                             <div className="flex items-center gap-4 mb-8">
                                 <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 font-bold text-lg shrink-0">
                                     {selectedEmail.from[0]}
                                 </div>
                                 <div className="flex-1 min-w-0">
                                     <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
                                         <span className="font-semibold text-slate-900 dark:text-white truncate">{selectedEmail.from}</span>
                                         <span className="text-sm text-slate-500 truncate hidden sm:inline">&lt;{selectedEmail.from.toLowerCase().replace(' ', '.')}@example.com&gt;</span>
                                     </div>
                                     <div className="text-xs text-slate-500">To: Me</div>
                                 </div>
                             </div>

                             <div className="prose dark:prose-invert max-w-none text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed text-sm md:text-base">
                                 {/* Render HTML body if available, else preview */}
                                 {/* HTML content is sanitized on the backend with DOMPurify before being sent to frontend */}
                                 {selectedEmail.body && selectedEmail.body.includes('<') ? (
                                     <div dangerouslySetInnerHTML={{ 
                                         __html: replaceInlineImages(selectedEmail.body, selectedEmail.inlineAttachments) 
                                     }} />
                                 ) : (
                                     selectedEmail.body || selectedEmail.preview
                                 )}
                             </div>

                             {/* Attachments */}
                             {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
                                 <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
                                    <div className="flex items-center gap-2 mb-4 text-sm text-slate-500 dark:text-slate-400">
                                        <span className="font-semibold text-slate-900 dark:text-white">{selectedEmail.attachments.length} attachment{selectedEmail.attachments.length > 1 ? 's' : ''}</span>
                                        <span>•</span>
                                        <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" /> Scanned by Gmail</span>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                                        {selectedEmail.attachments.map((att) => (
                                            <div 
                                                key={att.id}
                                                className="group relative flex flex-col rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden hover:shadow-md transition-all cursor-pointer"
                                                onClick={() => handleDownloadAttachment(selectedEmail.accountId || '', selectedEmail.id, att)}
                                            >
                                                {/* Preview Area (Mock) */}
                                                <div className="h-32 bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center border-b border-slate-100 dark:border-slate-700 group-hover:bg-slate-200 dark:group-hover:bg-slate-700 transition-colors">
                                                    <File className="w-12 h-12 text-slate-400" />
                                                </div>
                                                
                                                {/* Footer */}
                                                <div className="p-3 bg-white dark:bg-slate-800">
                                                    <div className="flex items-start gap-2">
                                                        <div className="bg-red-500 rounded px-1 py-0.5 text-[10px] font-bold text-white uppercase shrink-0 mt-0.5">PDF</div>
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate" title={att.filename}>
                                                                {att.filename}
                                                            </p>
                                                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                                                {Math.round(att.size / 1024)} KB
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Hover Overlay */}
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-[1px]">
                                                    <div className="flex flex-col items-center text-white">
                                                        <Download className="w-8 h-8 mb-1 drop-shadow-md" />
                                                        <span className="text-xs font-medium drop-shadow-md">Download</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                 </div>
                             )}
                        </div>

                        {/* Reply Section */}
                        <div className="p-4 md:p-6 border-t border-slate-200 dark:border-dark-border bg-slate-50/30 dark:bg-black/20">
                             {!isReplying ? (
                                 <button 
                                    onClick={() => setIsReplying(true)}
                                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 transition-colors w-full sm:w-auto justify-center sm:justify-start"
                                 >
                                    <CornerUpLeft className="w-4 h-4" />
                                    <span>Reply</span>
                                 </button>
                             ) : (
                                 <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm animate-in fade-in slide-in-from-bottom-2">
                                     <div className="flex items-center justify-between mb-2 text-sm text-slate-500">
                                        <span>Replying to <span className="font-medium text-slate-700 dark:text-slate-300">{selectedEmail.from}</span></span>
                                        <button onClick={() => setIsReplying(false)}><X className="w-4 h-4" /></button>
                                     </div>
                                     <textarea 
                                        value={replyText}
                                        onChange={(e) => setReplyText(e.target.value)}
                                        placeholder="Write your reply..."
                                        className="w-full min-h-[120px] resize-none bg-transparent outline-none text-slate-800 dark:text-slate-200 placeholder-slate-400"
                                        autoFocus
                                     />
                                     <div className="flex justify-end mt-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                                         <button 
                                            onClick={handleSendReply}
                                            disabled={!replyText.trim() || isSending}
                                            className="bg-productivity-600 hover:bg-productivity-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                                         >
                                             {isSending ? <ProductivitySpinner size="sm" /> : <Send className="w-4 h-4" />}
                                             {isSending ? 'Sending...' : 'Send'}
                                         </button>
                                     </div>
                                 </div>
                             )}
                        </div>
                    </div>
                ) : (
                    /* List View */
                    <div className="flex flex-col h-full">
                        <div className="p-4 border-b border-slate-200 dark:border-dark-border flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 shrink-0">
                             <div className="flex items-center gap-4">
                                <h2 className="font-semibold text-slate-900 dark:text-white truncate max-w-[200px] sm:max-w-none">
                                    {selectedAccountId 
                                        ? `${accounts.find(a => a.id === selectedAccountId)?.provider} Inbox` 
                                        : 'Unified Inbox'
                                    }
                                </h2>
                                <button 
                                  onClick={() => setFilterUnread(!filterUnread)}
                                  className={`hidden sm:flex text-xs font-medium px-3 py-1.5 rounded-lg border items-center gap-2 transition-colors ${
                                      filterUnread 
                                      ? 'bg-productivity-50 dark:bg-productivity-500/10 text-productivity-600 dark:text-productivity-400 border-productivity-200 dark:border-productivity-500/20' 
                                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                                  }`}
                                >
                                  <div className={`w-1.5 h-1.5 rounded-full ${filterUnread ? 'bg-productivity-500' : 'bg-slate-300'}`} />
                                  Unread Only
                                </button>
                             </div>
                             <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => setFilterUnread(!filterUnread)}
                                    className={`sm:hidden p-2 rounded-lg transition-colors ${filterUnread ? 'bg-productivity-100 text-productivity-600' : 'text-slate-500'}`}
                                >
                                    <div className={`w-2 h-2 rounded-full ${filterUnread ? 'bg-productivity-600' : 'bg-slate-300'}`} />
                                </button>
                                <button 
                                    onClick={() => fetchData(true)}
                                    className={`p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-500 transition-colors ${isLoading ? 'animate-spin' : ''}`}
                                >
                                    <RefreshCw className="w-4 h-4" />
                                </button>
                             </div>
                        </div>
                        <div className="divide-y divide-slate-100 dark:divide-slate-800 overflow-y-auto flex-1">
                            {isLinking ? (
                                <div className="flex flex-col items-center justify-center h-full text-productivity-500">
                                    <ProductivityLoader fullScreen={false} text="Connecting Email Account" />
                                </div>
                            ) : isLoading && emails.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full">
                                    <ProductivityLoader fullScreen={false} text="Loading emails..." />
                                </div>
                            ) : error ? (
                                <div className="flex flex-col items-center justify-center h-full text-red-500 p-4 text-center">
                                    <p>{error}</p>
                                    <button onClick={() => fetchData(true)} className="mt-2 text-sm underline">Try Again</button>
                                </div>
                            ) : (
                                <>
                                    {filteredEmails.map(email => (
                                        <div 
                                            key={email.id} 
                                            className={`group flex flex-col p-3 hover:shadow-md hover:z-10 border-b border-slate-100 dark:border-slate-800/50 cursor-pointer transition-all ${!email.read ? 'bg-white dark:bg-dark-surface font-bold' : 'bg-slate-50/50 dark:bg-dark-surface/50 text-slate-600 dark:text-slate-400'}`}
                                            onClick={() => handleEmailClick(email)}
                                        >
                                            <div className="flex items-center gap-4">
                                                {/* Star */}
                                                <div className="flex items-center shrink-0 pl-1 relative">
                                                    <Star className="w-5 h-5 text-slate-300 dark:text-slate-600 hover:text-yellow-400 transition-colors" />
                                                    {/* Provider Indicator Dot */}
                                                    <div className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-dark-surface ${
                                                        (email as any).provider === 'Gmail' ? 'bg-red-500' : 'bg-blue-500'
                                                    }`} title={(email as any).provider} />
                                                </div>

                                                {/* Sender */}
                                                <div className={`w-48 shrink-0 flex flex-col justify-center ${!email.read ? 'text-slate-900 dark:text-white font-bold' : ''}`}>
                                                    <span className="truncate">
                                                        {email.from.includes('<') && email.from.split('<')[0].trim().length > 0 
                                                            ? email.from.split('<')[0].trim() 
                                                            : email.from.replace(/[<>]/g, '')}
                                                    </span>
                                                    {/* Category Badge (Only in Unified View) */}
                                                    {!selectedAccountId && email.category && (
                                                        <span className={`text-[10px] font-medium truncate flex items-center gap-1 ${
                                                            email.category === 'Work' ? 'text-violet-500' :
                                                            email.category === 'Personal' ? 'text-productivity-500' :
                                                            email.category === 'Family' ? 'text-emerald-500' : 'text-slate-500'
                                                        }`}>
                                                            {email.category} • <span className={(email as any).provider === 'Gmail' ? 'text-red-500' : 'text-blue-500'}>{(email as any).provider}</span>
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Content */}
                                                <div className="flex-1 min-w-0 flex items-center gap-2">
                                                    <span className={`truncate ${!email.read ? 'text-slate-900 dark:text-white font-bold' : ''}`}>
                                                        {email.subject}
                                                    </span>
                                                    <span className="text-slate-400 dark:text-slate-500 truncate hidden sm:inline">
                                                        - {email.preview}
                                                    </span>
                                                </div>

                                                {/* Date */}
                                                <div className={`shrink-0 text-xs w-20 text-right ${!email.read ? 'text-slate-900 dark:text-white font-bold' : ''}`}>
                                                    {new Date(email.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                </div>
                                            </div>
                                            
                                            {/* Inline Attachments */}
                                            {email.attachments && email.attachments.length > 0 && (
                                                <div className="flex flex-wrap gap-2 mt-2 ml-14 pl-1">
                                                    {email.attachments.slice(0, 3).map(att => {
                                                        // Determine file type badge color
                                                        const ext = att.filename.split('.').pop()?.toLowerCase() || '';
                                                        const typeColor = 
                                                            ['pdf'].includes(ext) ? 'bg-red-500' :
                                                            ['doc', 'docx'].includes(ext) ? 'bg-blue-500' :
                                                            ['xls', 'xlsx', 'csv'].includes(ext) ? 'bg-green-500' :
                                                            ['ppt', 'pptx'].includes(ext) ? 'bg-orange-500' :
                                                            ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext) ? 'bg-purple-500' :
                                                            ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext) ? 'bg-yellow-500' :
                                                            'bg-slate-500';
                                                        const typeLabel = ext.toUpperCase() || 'FILE';
                                                        
                                                        return (
                                                            <button
                                                                key={att.id}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleDownloadAttachment(email.accountId || '', email.id, att);
                                                                }}
                                                                className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg text-xs transition-colors group/att"
                                                                title={`Download ${att.filename}`}
                                                            >
                                                                <span className={`${typeColor} text-white text-[10px] font-bold px-1.5 py-0.5 rounded uppercase`}>
                                                                    {typeLabel}
                                                                </span>
                                                                <span className="text-slate-600 dark:text-slate-300 truncate max-w-[120px] font-normal">
                                                                    {att.filename}
                                                                </span>
                                                                <Download className="w-3 h-3 text-slate-400 group-hover/att:text-productivity-500 shrink-0" />
                                                            </button>
                                                        );
                                                    })}
                                                    {email.attachments.length > 3 && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setAttachmentModalEmail(email);
                                                            }}
                                                            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg text-xs text-slate-500 dark:text-slate-400 transition-colors font-normal"
                                                        >
                                                            <Paperclip className="w-3 h-3" />
                                                            +{email.attachments.length - 3} more
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {filteredEmails.length === 0 && <div className="p-8 text-center text-slate-500">No emails found in this inbox.</div>}
                                    
                                    {/* Load More Button */}
                                    {hasMore && !isLoading && (
                                        <div className="p-4 text-center">
                                            <button 
                                                onClick={handleLoadMore}
                                                disabled={isLoadingMore}
                                                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 flex items-center gap-2 mx-auto"
                                            >
                                                {isLoadingMore && <ProductivitySpinner size="sm" />}
                                                {isLoadingMore ? 'Loading...' : 'Load More'}
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
      </div>

      {/* Attachment Modal */}
      {attachmentModalEmail && (
        <div 
            className="fixed inset-0 flex items-center justify-center z-50 bg-black/30 backdrop-blur-sm p-4"
            onClick={() => setAttachmentModalEmail(null)}
        >
            <div 
                className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-6 animate-in fade-in zoom-in duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">Attachments</h3>
                    <button onClick={() => setAttachmentModalEmail(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="space-y-3">
                    {attachmentModalEmail.attachments?.map(att => (
                        <button
                            key={att.id}
                            onClick={() => handleDownloadAttachment(attachmentModalEmail.accountId || '', attachmentModalEmail.id, att)}
                            className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left group"
                        >
                            <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 group-hover:text-productivity-500 transition-colors">
                                <File className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="font-medium text-slate-900 dark:text-white truncate">{att.filename}</div>
                                <div className="text-xs text-slate-500">{Math.round(att.size / 1024)} KB</div>
                            </div>
                            <Download className="w-4 h-4 text-slate-400 group-hover:text-productivity-500" />
                        </button>
                    ))}
                </div>
            </div>
        </div>
      )}

      {/* Compose Modal (portal) - Bottom Right */}
      {isComposeOpen && (
        <div className="fixed bottom-3 right-3 md:bottom-6 md:right-6 z-50">
          <div className="bg-gradient-to-br from-white to-slate-50 dark:from-slate-800 dark:to-slate-900 w-[calc(100vw-24px)] sm:w-[500px] md:w-[500px] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col h-[80vh] sm:h-[600px] animate-in fade-in slide-in-from-bottom-4 duration-200 overflow-hidden">
              <div className="flex justify-between items-center p-3 md:p-4 border-b border-slate-200 dark:border-dark-border flex-shrink-0">
                  <h2 className="text-base md:text-lg font-bold text-slate-900 dark:text-white truncate">New Message</h2>
                  <button onClick={() => setIsComposeOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex-shrink-0">
                      <X className="w-4 h-4 md:w-5 md:h-5" />
                  </button>
              </div>
              <div className="flex-1 flex flex-col p-3 md:p-4 gap-3 overflow-y-auto">{/* Keep content unchanged, only improve internal spacing */}
                  {/* Sender Selection */}
                  {accounts.length > 0 && (
                      <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">From</label>
                          <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
                              {accounts.map(acc => (
                                  <button
                                      key={acc.id}
                                      type="button"
                                      onClick={() => setComposeSender(acc.id)}
                                      className={`p-3 rounded-lg text-left transition-all border-2 ${
                                          (composeSender === acc.id || (!composeSender && accounts[0]?.id === acc.id))
                                              ? 'border-productivity-500 bg-productivity-50 dark:bg-productivity-900/20 text-productivity-900 dark:text-productivity-100'
                                              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                                      }`}
                                  >
                                      <div className="font-medium text-sm">{acc.address}</div>
                                      <div className="text-xs opacity-75 mt-0.5">{acc.provider}</div>
                                  </button>
                              ))}
                          </div>
                      </div>
                  )}
                  
                  {/* To field with autofill */}
                  <div className="relative">
                      <input 
                          type="email" 
                          placeholder="To" 
                          value={composeTo}
                          onChange={(e) => {
                              setComposeTo(e.target.value);
                              setShowEmailSuggestions(e.target.value.length > 0);
                          }}
                          onFocus={() => setShowEmailSuggestions(composeTo.length > 0)}
                          onBlur={() => setTimeout(() => setShowEmailSuggestions(false), 200)}
                          className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-productivity-500 outline-none"
                      />
                      {showEmailSuggestions && getEmailSuggestions().length > 0 && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-50 max-h-40 overflow-y-auto">
                              {getEmailSuggestions().map((email, idx) => (
                                  <button
                                      key={idx}
                                      type="button"
                                      onClick={() => {
                                          setComposeTo(email);
                                          setShowEmailSuggestions(false);
                                      }}
                                      className="w-full text-left px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm"
                                  >
                                      {email}
                                  </button>
                              ))}
                          </div>
                      )}
                  </div>
                  <input 
                      type="text" 
                      placeholder="Subject" 
                      value={composeSubject}
                      onChange={(e) => setComposeSubject(e.target.value)}
                      className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-productivity-500 outline-none"
                  />
                  <textarea 
                      placeholder="Message body..." 
                      value={composeBody}
                      onChange={(e) => setComposeBody(e.target.value)}
                      className="flex-1 w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-productivity-500 outline-none resize-none"
                  />
              </div>
              <div className="p-4 border-t border-slate-200 dark:border-dark-border flex justify-end gap-3">
                  <button 
                      onClick={() => setIsComposeOpen(false)}
                      className="px-4 py-2 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                  >
                      Discard
                  </button>
                  <button 
                      onClick={handleSendCompose}
                      disabled={!composeTo || !composeSubject || !composeBody || isSendingCompose}
                      className="bg-productivity-600 hover:bg-productivity-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white px-6 py-2 rounded-xl flex items-center gap-2 transition-colors shadow-lg shadow-productivity-500/20 font-medium"
                  >
                      {isSendingCompose ? <ProductivitySpinner size="sm" /> : <Send className="w-4 h-4" />}
                      {isSendingCompose ? 'Sending...' : 'Send'}
                  </button>
              </div>
          </div>
        </div>
      )}

      {/* Link Email Modal (portal) - Centered */}
      {isLinkModalOpen && (
        <div 
            className="fixed inset-0 flex items-center justify-center z-50 bg-black/30 backdrop-blur-sm p-4 sm:p-6"
            onClick={() => setIsLinkModalOpen(false)}
        >
          <div 
              className="bg-gradient-to-br from-white to-slate-50 dark:from-slate-800 dark:to-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-4 md:p-6 animate-in fade-in zoom-in duration-200"
              onClick={(e) => e.stopPropagation()}
          >
              <div className="flex justify-between items-center mb-4 md:mb-6">
                  <h2 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white">Link Email Account</h2>
                  <button onClick={() => setIsLinkModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex-shrink-0">
                      <X className="w-4 h-4 md:w-5 md:h-5" />
                  </button>
              </div>

              <div className="space-y-3 md:space-y-4">
                  <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Provider</label>
                      <select 
                        value={linkProvider}
                        onChange={(e) => setLinkProvider(e.target.value)}
                        className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-productivity-500 outline-none"
                      >
                          <option value="Gmail">Gmail</option>
                          <option value="Outlook">Outlook</option>
                          <option value="iCloud" disabled>iCloud (Coming Soon)</option>
                          <option value="Yahoo Mail" disabled>Yahoo Mail (Coming Soon)</option>
                      </select>
                  </div>

                  <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Category</label>
                      <div className="grid grid-cols-2 gap-2">
                          {['Personal', 'Work', 'Family', 'Other'].map((cat) => (
                              <button
                                  key={cat}
                                  onClick={() => setLinkCategory(cat as CalendarCategory)}
                                  className={`p-2 rounded-lg text-sm font-medium border transition-colors ${
                                      linkCategory === cat 
                                      ? 'bg-productivity-50 dark:bg-productivity-900/20 border-productivity-500 text-productivity-700 dark:text-productivity-400' 
                                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                                  }`}
                              >
                                  {cat}
                              </button>
                          ))}
                      </div>
                  </div>

                  <div className="pt-4 flex gap-3">
                      <button 
                        onClick={() => setIsLinkModalOpen(false)}
                        className="flex-1 py-2.5 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                      >
                          Cancel
                      </button>
                      <button 
                          onClick={handleLinkAccount}
                          className={`flex-1 py-2.5 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 ${
                              linkProvider === 'Outlook' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-productivity-600 hover:bg-productivity-700'
                          }`}
                      >
                          Connect Account
                      </button>
                  </div>
              </div>
          </div>
        </div>
      )}

      {/* Date Range Picker Modal */}
      {isDatePickerOpen && (
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onClose={() => setIsDatePickerOpen(false)}
        />
      )}
    </div>
  );
};

export default EmailPage;
