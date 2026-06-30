export interface DriveFile {
  id: string; name: string; mimeType: string;
  size?: string; modifiedTime?: string; content?: string;
}
export interface PlaybookSection { title: string; phase: string; tasks: PlaybookTask[]; }
export interface PlaybookTask {
  task: string; owner: string; timeline: string;
  startTime?: string; endTime?: string;
  dependencies: string; status: string; notes: string;
}
export interface PlaybookData {
  creditUnion: string; goLiveDate?: string; sections: PlaybookSection[]; summary: string;
}
export interface ChecklistItem {
  category: string; item: string; owner: string; dueDate: string;
  status: 'Not Started' | 'In Progress' | 'Complete' | 'Blocked';
  notes: string; priority: 'High' | 'Medium' | 'Low';
}
export interface ChecklistData { creditUnion: string; items: ChecklistItem[]; summary: string; }
export interface AdminKey {
  id: string; name: string; service: 'anthropic' | 'google_drive' | 'other';
  keyPreview: string; createdAt: string; status: 'active' | 'inactive';
}