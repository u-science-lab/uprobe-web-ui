import { normalizeTargetInputs } from './utils/targetInputs';
import axios from 'axios';
import { ApiResponse } from './types';
import { AUTH_CONFIG, getToken } from './utils';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export type AgentSseEvent =
  | { event: 'delta'; agent: string; text: string }
  | { event: 'tool'; agent: string; tools: string[] }
  | { event: 'done'; message: string; thinking?: string[]; process?: unknown[] }
  | { event: 'error'; detail: string };

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 600000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    if (error.response) {
      switch (error.response.status) {
        case 401:
          // Handle unauthorized error
          localStorage.removeItem('token');
          localStorage.removeItem('isAuthenticated');
          localStorage.removeItem('tokenExpiration');
          window.location.href = '/auth';
          break;
        case 403:
          console.error('Access forbidden:', error.response.data);
          break;
        case 404:
          console.error('Resource not found:', error.response.data);
          break;
        case 500:
          console.error('Server error:', error.response.data);
          break;
        default:
          console.error('API error:', error.response.data);
      }
    } else if (error.request) {
      console.error('Network error:', error.request);
    } else {
      console.error('Error:', error.message);
    }
    return Promise.reject(error);
  }
);

// API service class
class ApiService {
  // Authentication related
  static async login(emailOrUsername: string, password: string, rememberMe: boolean = false): Promise<{ access_token: string; token_type: string }> {
    // Send JSON data to match backend LoginRequest model
    const response = await api.post('/auth/login', { 
      email_or_username: emailOrUsername, 
      password,
      remember_me: rememberMe
    }) as { token: string; token_type: string; user_info: any };

    // Map backend response to expected frontend format
    const mappedResponse = {
      access_token: response.token,
      token_type: response.token_type
    };

    if (response.token) {
      if (rememberMe) {
        // Remember me: use localStorage, expires in 30 days
        localStorage.setItem('token', response.token);
        localStorage.setItem('isAuthenticated', 'true');
        localStorage.setItem('rememberMe', 'true');
        const expirationTime = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 days
        localStorage.setItem('tokenExpiration', expirationTime.toString());
        // Clear data in sessionStorage
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('isAuthenticated');
        sessionStorage.removeItem('tokenExpiration');
      } else {
        // Don't remember me: use sessionStorage, expires when browser closes
        sessionStorage.setItem('token', response.token);
        sessionStorage.setItem('isAuthenticated', 'true');
        const expirationTime = Date.now() + AUTH_CONFIG.TOKEN_EXPIRY_DURATION;
        sessionStorage.setItem('tokenExpiration', expirationTime.toString());
        // Clear data in localStorage
        localStorage.removeItem('token');
        localStorage.removeItem('isAuthenticated');
        localStorage.removeItem('tokenExpiration');
        localStorage.removeItem('rememberMe');
      }
    }
    return mappedResponse;
  }

  static async register(email: string, password: string, username: string): Promise<{ access_token: string; token_type: string }> {
    const response = await api.post('/auth/register', { 
      email, 
      password, 
      username 
    }) as { token: string; token_type: string; user_info: any };
    
    const mappedResponse = {
      access_token: response.token,
      token_type: response.token_type,
      user_info: response.user_info
    };

    if (response.token) {
      localStorage.setItem('token', response.token);
      localStorage.setItem('isAuthenticated', 'true');
      // Set login timestamp with configurable expiry duration
      const expirationTime = Date.now() + AUTH_CONFIG.TOKEN_EXPIRY_DURATION;
      localStorage.setItem('tokenExpiration', expirationTime.toString());
    }
    return mappedResponse;
  }

  // Custom Probes
  static async getCustomProbes(): Promise<any[]> {
    return api.get('/custom_probes/');
  }

  static async saveCustomProbe(probeData: any): Promise<any> {
    return api.post('/custom_probes/', probeData);
  }

  static async deleteCustomProbe(probeId: string): Promise<void> {
    return api.delete(`/custom_probes/${probeId}`);
  }

  // Probe design workflow related
  static async getBarcodeOptions(): Promise<string[]> {
    return api.get('/workflow/barcodes');
  }

  static async getBarcodeSequence(barcode: string): Promise<{ [key: string]: string }> {
    return api.get(`/workflow/barcodes/${barcode}`);
  }

  static async getBuiltinProbes(): Promise<any> {
    return api.get('/workflow/builtin_probes');
  }

  static async getSpeciesOptions(): Promise<string[]> {
    const response = await api.get('/genome/') as {name: string, is_public: boolean}[];
    return response.map(g => g.name);
  }

  // Genome related
  static async getGenomes(): Promise<{name: string, is_public: boolean}[]> {
    return api.get('/genome/');
  }

  static async getGenomeFiles(genomeName: string): Promise<{ genome: string; files: string[] }> {
    return api.get(`/genome/${genomeName}/files`);
  }

  static async getFileMetadata(genomeName: string, fileName: string): Promise<{
    size: number;
    created: string;
    modified: string;
    is_preset: boolean;
    can_delete: boolean;
  }> {
    return api.get(`/genome/${genomeName}/${fileName}/metadata`);
  }

  static async uploadGenomeFile(genomeName: string, file: File): Promise<{ message: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/genome/${genomeName}/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  }

  static async addGenome(genomeName: string): Promise<{ message: string }> {
    return api.post(`/genome/${genomeName}`);
  }

  static async deleteGenome(genomeName: string): Promise<{ message: string }> {
    return api.delete(`/genome/${genomeName}`);
  }

  static async deleteGenomeFile(genomeName: string, fileName: string): Promise<{ message: string }> {
    return api.delete(`/genome/${genomeName}/${fileName}`);
  }

  static async downloadGenomeFile(genomeName: string, fileName: string): Promise<Blob> {
    return api.get(`/genome/${genomeName}/${fileName}`, {
      responseType: 'blob'
    });
  }

  // User related
  static async getCurrentUser(): Promise<any> {
    return api.get('/auth/check');
  }

  static async updateUserProfile(data: { 
    full_name?: string; 
    email?: string;
    title?: string;
    department?: string;
    location?: string;
    phone?: string;
    bio?: string;
  }): Promise<any> {
    return api.put('/auth/profile', data);
  }

  static async updatePassword(data: { current_password: string; new_password: string }): Promise<any> {
    return api.put('/auth/password', data);
  }

  static async forgotPassword(email: string): Promise<any> {
    return api.post('/auth/forgot-password', { email });
  }

  static async resetPassword(email: string, reset_code: string, new_password: string): Promise<any> {
    return api.post('/auth/reset-password', {
      email,
      reset_code,
      new_password
    });
  }

  static async checkEmailSupport(email: string): Promise<any> {
    return api.post('/auth/check-email-support', { email });
  }

  static async sendVerificationCode(email: string): Promise<any> {
    return api.post('/auth/send-verification-code', { email });
  }

  static async registerWithCode(payload: {
    email: string;
    verification_code: string;
    password: string;
    username: string;
    full_name: string;
    department: string;
    location: string;
  }): Promise<{ access_token: string; token_type: string }> {
    const response = await api.post('/auth/register-with-code', payload) as { token: string; token_type: string; user_info: any };
    
    const mappedResponse = {
      access_token: response.token,
      token_type: response.token_type,
      user_info: response.user_info
    };

    if (response.token) {
      localStorage.setItem('token', response.token);
      localStorage.setItem('isAuthenticated', 'true');
      // Set login timestamp with configurable expiry duration
      const expirationTime = Date.now() + AUTH_CONFIG.TOKEN_EXPIRY_DURATION;
      localStorage.setItem('tokenExpiration', expirationTime.toString());
    }
    return mappedResponse;
  }

  static async uploadAvatar(file: File): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/user/upload-avatar', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  }

  static async listAgentConversations(): Promise<any[]> {
    return api.get('/agent/conversations');
  }

  static async createAgentConversation(title: string = 'New Conversation'): Promise<any> {
    return api.post('/agent/conversations', { title });
  }

  static async getAgentConversation(conversationId: string): Promise<any> {
    return api.get(`/agent/conversations/${conversationId}`);
  }

  static async renameAgentConversation(conversationId: string, title: string): Promise<any> {
    return api.patch(`/agent/conversations/${conversationId}`, { title });
  }

  static async deleteAgentConversation(conversationId: string): Promise<any> {
    return api.delete(`/agent/conversations/${conversationId}`);
  }

  static async sendAgentMessage(
    conversationId: string,
    payload: {
      content: string;
      attachment_ids?: string[];
      api_key?: string;
      model?: string;
      proxy?: string;
    },
    signal?: AbortSignal
  ): Promise<{ thinking: string[]; message: string; process?: unknown[] }> {
    return api.post(`/agent/conversations/${conversationId}/message`, payload, { signal });
  }

  /** SSE events from POST …/message/stream or …/rewind/stream */
  static consumeAgentMessageSse(
    urlPath: string,
    payload: Record<string, unknown>,
    signal: AbortSignal | undefined,
    onEvent: (e: AgentSseEvent) => void
  ): Promise<{ message: string; thinking: string[]; process: unknown[] }> {
    const token = getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return fetch(`${API_BASE_URL}${urlPath}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal,
    }).then(async (res) => {
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const j = (await res.json()) as { detail?: unknown };
          if (j?.detail != null) {
            detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail);
          }
        } catch {
          try {
            detail = (await res.text()).slice(0, 500) || detail;
          } catch {
            /* ignore */
          }
        }
        throw new Error(detail);
      }
      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }
      const decoder = new TextDecoder();
      let buffer = '';
      let doneMessage = '';
      let doneThinking: string[] = [];
      let doneProcess: unknown[] = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() ?? '';
        for (const block of blocks) {
          const lines = block.split('\n').filter((l) => l.length > 0);
          for (const line of lines) {
            const trimmed = line.trimStart();
            if (!trimmed.startsWith('data:')) continue;
            const jsonStr = trimmed.slice(5).trimStart();
            let evt: AgentSseEvent;
            try {
              evt = JSON.parse(jsonStr) as AgentSseEvent;
            } catch {
              continue;
            }
            onEvent(evt);
            if (evt.event === 'done') {
              doneMessage = evt.message ?? '';
              doneThinking = Array.isArray(evt.thinking) ? evt.thinking : [];
              doneProcess = Array.isArray(evt.process) ? evt.process : [];
            }
            if (evt.event === 'error') {
              throw new Error(evt.detail || 'Stream error');
            }
          }
        }
      }
      return { message: doneMessage, thinking: doneThinking, process: doneProcess };
    });
  }

  static streamAgentMessage(
    conversationId: string,
    payload: {
      content: string;
      attachment_ids?: string[];
      api_key?: string;
      model?: string;
      proxy?: string;
    },
    signal: AbortSignal | undefined,
    onEvent: (e: AgentSseEvent) => void
  ): Promise<{ message: string; thinking: string[]; process: unknown[] }> {
    return this.consumeAgentMessageSse(
      `/agent/conversations/${conversationId}/message/stream`,
      payload,
      signal,
      onEvent
    );
  }

  static streamAgentRewind(
    conversationId: string,
    payload: {
      user_turn_index: number;
      content: string;
      attachment_ids?: string[];
      api_key?: string;
      model?: string;
      proxy?: string;
    },
    signal: AbortSignal | undefined,
    onEvent: (e: AgentSseEvent) => void
  ): Promise<{ message: string; thinking: string[]; process: unknown[] }> {
    return this.consumeAgentMessageSse(
      `/agent/conversations/${conversationId}/rewind/stream`,
      payload,
      signal,
      onEvent
    );
  }

  static async rewindAgentConversation(
    conversationId: string,
    payload: {
      user_turn_index: number;
      content: string;
      attachment_ids?: string[];
      api_key?: string;
      model?: string;
      proxy?: string;
    },
    signal?: AbortSignal
  ): Promise<{ thinking: string[]; message: string; process?: unknown[] }> {
    return api.post(`/agent/conversations/${conversationId}/rewind`, payload, { signal });
  }

  static async stopAgentConversation(conversationId: string): Promise<any> {
    return api.post(`/agent/conversations/${conversationId}/stop`);
  }

  static async clearAgentConversation(conversationId: string): Promise<any> {
    return api.post(`/agent/conversations/${conversationId}/clear`);
  }

  static async uploadAgentAttachment(
    conversationId: string,
    file: File,
    options?: {
      api_key?: string;
      model?: string;
      proxy?: string;
    },
    signal?: AbortSignal
  ): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    if (options?.api_key) {
      formData.append('api_key', options.api_key);
    }
    if (options?.model) {
      formData.append('model', options.model);
    }
    if (options?.proxy) {
      formData.append('proxy', options.proxy);
    }
    return api.post(`/agent/conversations/${conversationId}/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      signal,
    });
  }

  static async deleteAgentAttachment(
    conversationId: string,
    attachmentId: string
  ): Promise<any> {
    return api.delete(`/agent/conversations/${conversationId}/upload/${attachmentId}`);
  }

  // Barcode generation using workflow routes
  static async generateQuickBarcode(config: {
    num_barcodes: number;
    length: number;
    alphabet?: string;
    rc_free?: boolean;
    gc_limits?: [number, number];
    prevent_patterns?: string[];
  }): Promise<string[]> {
    return api.post('/workflow/barcodes/quick', config);
  }

  static async generatePcrBarcode(config: {
    num_barcodes: number;
    length?: number;
  }): Promise<string[]> {
    return api.post('/workflow/barcodes/pcr', config);
  }

  static async generateSequencingBarcode(config: {
    num_barcodes: number;
    length?: number;
  }): Promise<string[]> {
    return api.post('/workflow/barcodes/sequencing', config);
  }

  // Legacy method - kept for backward compatibility
  static async generateBarcode(config: {
    length: number;
    type?: string;
    count?: number;
    constraints?: any;
  }): Promise<{ barcode: string }> {
    // Use quick generation by default
    const result = await this.generateQuickBarcode({
      num_barcodes: 1,
      length: config.length,
      alphabet: 'ACTG',
      rc_free: true
    });
    return { barcode: result[0] };
  }

  static async generateBarcodes(config: {
    length: number;
    type?: string;
    count: number;
    constraints?: any;
  }): Promise<{ barcodes: string[] }> {
    const result = await this.generateQuickBarcode({
      num_barcodes: config.count,
      length: config.length,
      alphabet: 'ACTG',
      rc_free: true
    });
    return { barcodes: result };
  }

  // Task submission
  static async submitTask(data: any): Promise<ApiResponse<{ job_id: string }>> {
    const yaml = await import('js-yaml');
    const formData = new FormData();
    
    // Convert config data to YAML format
    const yamlContent = yaml.dump(normalizeTargetInputs(data), {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
      sortKeys: false
    });
    
    formData.append('file', new Blob([yamlContent], { type: 'application/x-yaml' }), 'protocol.yaml');
    
    return api.post('workflow/submit_task', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  }

  // Task management - use task router
  static async getAllTasks(): Promise<ApiResponse<any[]>> {
    return api.get(`/task/`);
  }

  static async getTaskById(taskId: string): Promise<ApiResponse<any>> {
    return api.get(`/task/${taskId}`);
  }

  static async runTask(taskId: string): Promise<ApiResponse<any>> {
    return api.post(`/task/${taskId}/run`);
  }

  static async pauseTask(taskId: string): Promise<ApiResponse<any>> {
    return api.post(`/task/${taskId}/pause`);
  }

  static async resumeTask(taskId: string): Promise<ApiResponse<any>> {
    return api.post(`/task/${taskId}/resume`);
  }

  static async deleteTask(taskId: string): Promise<ApiResponse<any>> {
    return api.delete(`/task/${taskId}`);
  }

  static async downloadTaskResult(taskId: string): Promise<Blob> {
    const response = await axios.get(`${API_BASE_URL}/task/${taskId}/download`, {
      headers: {
        Authorization: `Bearer ${getToken()}`
      },
      responseType: 'blob'
    });
    return response.data;
  }

  static async getTaskFiles(taskId: string): Promise<ApiResponse<{ files: any[] }>> {
    return api.get(`/task/${taskId}/files`);
  }

  static async downloadTaskFile(taskId: string, filename: string): Promise<Blob> {
    const response = await axios.get(`${API_BASE_URL}/task/${taskId}/file/${filename}`, {
      headers: {
        Authorization: `Bearer ${getToken()}`
      },
      responseType: 'blob'
    });
    return response.data;
  }

  static async getTaskReportContent(taskId: string, filename: string): Promise<string> {
    const response = await axios.get(`${API_BASE_URL}/task/${taskId}/file/${filename}`, {
      headers: {
        Authorization: `Bearer ${getToken()}`
      },
      responseType: 'text'
    });
    return response.data;
  }

  // Keep job related methods for backward compatibility
  static async getAllJobs(): Promise<ApiResponse<any[]>> {
    return this.getAllTasks();
  }

  static async getJobStatus(jobId: string): Promise<ApiResponse<any>> {
    return this.getTaskById(jobId);
  }

  static async cancelJob(jobId: string): Promise<ApiResponse<any>> {
    return this.pauseTask(jobId);
  }

  static async reRunJob(jobId: string): Promise<ApiResponse<any>> {
    return this.resumeTask(jobId);
  }

  static async removeJob(jobId: string): Promise<ApiResponse<any>> {
    return this.deleteTask(jobId);
  }

  static async getJobResult(jobId: string): Promise<Blob> {
    return this.downloadTaskResult(jobId);
  }

  static async logout(): Promise<void> {
    // This call is mainly for completeness, the main logic is clearing local storage.
    try {
      await api.post('/auth/logout');
    } catch (error) {
      console.error("Logout failed on server, but proceeding with local cleanup.", error);
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('isAuthenticated');
      localStorage.removeItem('tokenExpiration');
      // Redirect to login page to ensure clean state
      if (window.location.pathname !== '/auth') {
        window.location.href = '/auth';
      }
    }
  }
}

export default ApiService;
