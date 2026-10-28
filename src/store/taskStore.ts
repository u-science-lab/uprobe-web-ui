import { create } from 'zustand';
import ApiService from '../api';
import { Task } from '../types';
import YAML from 'yaml';

interface TaskState {
  // State
  tasks: Task[];
  isLoading: boolean;
  currentTask: Task | null;
  
  // Actions
  fetchTasks: () => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  pauseTask: (taskId: string) => Promise<void>;
  resumeTask: (taskId: string) => Promise<void>;
  runTask: (taskId: string) => Promise<void>;
  rerunTask: (taskId: string) => Promise<void>;
  refreshTaskList: () => void;
  setCurrentTask: (task: Task | null) => void;
}

const useTaskStore = create<TaskState>((set, get) => ({
  // Initial state
  tasks: [],
  isLoading: false,
  currentTask: null,
  
  // Actions
  fetchTasks: async () => {
    set({ isLoading: true });
    try {
      const response = await ApiService.getAllTasks();
      
      if (response) {
        // Backend task router returns an array directly, not wrapped in a data field
        const taskData = response.data || response;
        const apiTasks: Task[] = taskData.map((task: any) => ({
          id: task.id,
          name: task.name || 'Unnamed Task',
          description: task.description || 'Uprobe design task',
          status: task.status,
          phase: task.phase,
          progress: task.progress || 0,
          created_at: task.created_at || new Date().toISOString(),
          updated_at: task.updated_at || new Date().toISOString(),
          genome: task.genome || 'Unknown',
          parameters: task.parameters || {},
          result_url: task.result_url || '',
          yaml_content: task.yaml_content || '',
          error_message: task.error_message || '',
          no_filtered_probes: task.no_filtered_probes ?? false,
          raw_file: task.raw_file || undefined
        }));
        
        set({ tasks: apiTasks, isLoading: false });
      } else {
        set({ tasks: [], isLoading: false });
      }
    } catch (error) {
      console.error("Failed to fetch task data", error);
      set({ isLoading: false });
    }
  },
  
  deleteTask: async (taskId: string) => {
    try {
      await ApiService.deleteTask(taskId);
      
      // Update the tasks list after deletion
      set((state) => ({
        tasks: state.tasks.filter((task) => task.id !== taskId)
      }));
      
      return Promise.resolve();
    } catch (error) {
      console.error("Failed to delete task", error);
      return Promise.reject(error);
    }
  },
  
  pauseTask: async (taskId: string) => {
    try {
      await ApiService.pauseTask(taskId);
      
      // Update the task status in the state
      set((state) => ({
        tasks: state.tasks.map((task) =>
          task.id === taskId ? { ...task, status: "paused" } : task
        )
      }));
      
      return Promise.resolve();
    } catch (error) {
      console.error("Failed to pause task", error);
      return Promise.reject(error);
    }
  },
  
  resumeTask: async (taskId: string) => {
    try {
      await ApiService.resumeTask(taskId);
      
      // Update the task status in the state to pending (queued)
      set((state) => ({
        tasks: state.tasks.map((task) =>
          task.id === taskId ? { ...task, status: "pending" } : task
        )
      }));
      
      return Promise.resolve();
    } catch (error) {
      console.error("Failed to resume task", error);
      return Promise.reject(error);
    }
  },

  runTask: async (taskId: string) => {
    try {
      await ApiService.runTask(taskId);
      
      // Update the task status in the state to pending (queued)
      set((state) => ({
        tasks: state.tasks.map((task) =>
          task.id === taskId ? { ...task, status: "pending", progress: 0 } : task
        )
      }));
      
      return Promise.resolve();
    } catch (error) {
      console.error("Failed to run task", error);
      return Promise.reject(error);
    }
  },

  rerunTask: async (taskId: string) => {
    const { tasks, fetchTasks } = get();
    const taskToRerun = tasks.find(t => t.id === taskId);

    if (!taskToRerun || !taskToRerun.yaml_content) {
      const errorMessage = 'Task configuration not found, cannot rerun.';
      console.error(errorMessage);
      return Promise.reject(new Error(errorMessage));
    }

    try {
      const config = YAML.parse(taskToRerun.yaml_content);
      
      // Remove any existing '-rerun-XXXX' suffix before appending the new one
      const baseName = config.name.split('-rerun-')[0];
      config.name = `${baseName}-rerun-${Date.now().toString().slice(-4)}`;

      // Submit a new task with the old configuration
      const response = await ApiService.submitTask(config);
      const newTaskId = (response as any).data?.job_id || (response as any).job_id || (response as any).id;
      
      // Immediately run the new task
      if (newTaskId) {
        await ApiService.runTask(newTaskId);
      }

      // Refresh the task list to show the new task
      await fetchTasks();
    } catch (error) {
      console.error('Failed to rerun task:', error);
      return Promise.reject(error);
    }
  },
  
  refreshTaskList: () => {
    get().fetchTasks();
  },
  
  setCurrentTask: (task: Task | null) => {
    set({ currentTask: task });
  }
}));

export default useTaskStore; 
