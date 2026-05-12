import { writable, get } from 'svelte/store';
import { invoke } from "@tauri-apps/api/core";
import { currentProject } from './projectStore';
import { sidebarState, SIDEBAR_IDS, openSidebar, closeSidebar } from './sidebarStore';

export interface TodoItem {
    filePath: string;
    fileName: string;
    lineNum: number;
    content: string;
}

export const todoList = writable<TodoItem[]>([]);
export const isTodoSidebarOpen = writable(false);
export const isScanningTodos = writable(false);

// Sync with sidebarStore
sidebarState.subscribe(state => {
    const isOpen = state.openSidebars.has(SIDEBAR_IDS.TODO);
    if (get(isTodoSidebarOpen) !== isOpen) {
        isTodoSidebarOpen.set(isOpen);
        if (isOpen) {
            scanTodos();
        }
    }
});

export async function scanTodos() {
    let projectPath: string | null = null;
    currentProject.subscribe(p => projectPath = p)();

    if (!projectPath) return;

    isScanningTodos.set(true);
    try {
        const results = await invoke<any[]>("get_project_todos", { path: projectPath });
        
        const todos: TodoItem[] = [];
        results.forEach(fileResult => {
            fileResult.matches.forEach((m: any) => {
                todos.push({
                    filePath: fileResult.path,
                    fileName: fileResult.path.split(/[/\\]/).pop() || '',
                    lineNum: m.line_num + 1,
                    content: m.line_content.trim()
                });
            });
        });
        
        todoList.set(todos);
    } catch (error) {
        console.error("Failed to scan todos:", error);
    } finally {
        isScanningTodos.set(false);
    }
}

export function toggleTodoSidebar() {
    const isOpen = get(isTodoSidebarOpen);
    if (isOpen) {
        closeSidebar(SIDEBAR_IDS.TODO);
    } else {
        openSidebar(SIDEBAR_IDS.TODO);
        scanTodos();
    }
}
