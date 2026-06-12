import React, { useState, useEffect, useRef } from 'react';
import { Activity, ActivityType, Client, ACTIVITY_CONFIGS, UserRole } from '../types';
import { Plus, X, Link, HelpCircle, Check, Loader2, Upload, FileText, Trash2, Video, ImageIcon } from 'lucide-react';

interface ActivityFormProps {
  clients: Client[];
  currentRole: UserRole;
  currentUsername: string;
  activityToEdit?: Activity | null;
  onSave: (activity: Omit<Activity, 'id' | 'created_at'> & { id?: string, attached_files?: Array<{ file_name: string, file_path: string, file_type: string, is_new?: boolean }> }) => void;
  onCancel: () => void;
  preselectedClientId?: string;
}

export default function ActivityForm({
  clients,
  currentRole,
  currentUsername,
  activityToEdit,
  onSave,
  onCancel,
  preselectedClientId
}: ActivityFormProps) {
  // Common states
  const [clientId, setClientId] = useState('');
  const [activityType, setActivityType] = useState<ActivityType>('Poster');
  const [stage, setStage] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [driveLink, setDriveLink] = useState('');
  const [activityDate, setActivityDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [remarks, setRemarks] = useState('');

  // Blog specific states
  const [blogTitle, setBlogTitle] = useState('');
  const [blogUrl, setBlogUrl] = useState('');

  // Future proof states
  const [clientFeedback, setClientFeedback] = useState('');
  const [approvalStatus, setApprovalStatus] = useState<'Pending' | 'Approved' | 'Changes Requested'>('Pending');
  const [priority, setPriority] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [estimatedCompletion, setEstimatedCompletion] = useState('');

  // File Upload states
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<Array<{ id?: string, file_name: string, file_path: string, file_type: string, is_new?: boolean }>>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-fill and dynamic configurations
  // Filter active and non-deleted
  const activeClients = clients.filter(c => c.status === 'Active' && !c.is_deleted);

  useEffect(() => {
    if (preselectedClientId) {
      setClientId(preselectedClientId);
    } else if (activeClients.length > 0 && !clientId) {
      setClientId(activeClients[0].id);
    }
  }, [activeClients, clientId, preselectedClientId]);

  // When activity types update, match appropriate first stage
  useEffect(() => {
    const config = ACTIVITY_CONFIGS[activityType];
    if (config) {
      setStage(config.stages[config.stages.length - 1]); // Default to completion stage for faster logging
    }
  }, [activityType]);

  // Load edit values
  useEffect(() => {
    if (activityToEdit) {
      setClientId(activityToEdit.client_id);
      setActivityType(activityToEdit.activity_type);
      setStage(activityToEdit.stage);
      setTitle(activityToEdit.title);
      setDescription(activityToEdit.description);
      setDriveLink(activityToEdit.drive_link || '');
      setActivityDate(activityToEdit.activity_date);
      setRemarks(activityToEdit.remarks || '');
      setBlogTitle(activityToEdit.blog_title || '');
      setBlogUrl(activityToEdit.blog_url || '');
      setClientFeedback(activityToEdit.client_feedback || '');
      setApprovalStatus(activityToEdit.approval_status || 'Pending');
      setPriority(activityToEdit.priority || 'Medium');
      setEstimatedCompletion(activityToEdit.estimated_completion || '');
      // Load pre-existing files
      if (activityToEdit.files) {
        setAttachedFiles(activityToEdit.files);
      } else {
        setAttachedFiles([]);
      }
    }
  }, [activityToEdit]);

  // Handle Drag & Drop events
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadFile(e.target.files[0]);
    }
  };

  // Perform Native Upload request
  const uploadFile = async (file: File) => {
    if (!clientId) {
      setUploadError('Select a library client first.');
      return;
    }
    setIsUploading(true);
    setUploadError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`/api/upload?clientId=${clientId}&activityType=${activityType}`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Server upload failed.');
      }

      const result = await response.json();
      setAttachedFiles(prev => [...prev, { ...result, is_new: true }]);
    } catch (err: any) {
      console.error(err);
      setUploadError(err.message || 'Error occurred while uploading file.');
    } finally {
      setIsUploading(false);
    }
  };

  const removeAttachedFile = async (index: number, id?: string) => {
    if (id) {
      // Direct database attachment deletion
      try {
        const response = await fetch(`/api/files/${id}`, {
          method: 'DELETE'
        });
        if (!response.ok) {
          throw new Error('Could not delete file reference from database.');
        }
      } catch (err: any) {
        alert(err.message);
        return;
      }
    }
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Trigger click on hidden file input
  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId) {
      alert('Please select a client');
      return;
    }
    if (!title.trim()) {
      alert('Please provide a title');
      return;
    }

    onSave({
      id: activityToEdit?.id,
      client_id: clientId,
      activity_type: activityType,
      stage,
      title: title.trim(),
      description: description.trim(),
      drive_link: driveLink.trim(), // Optional field
      activity_date: activityDate,
      created_by: activityToEdit ? activityToEdit.created_by : currentUsername,
      remarks: remarks.trim() || undefined,
      blog_title: activityType === 'Blog' ? blogTitle.trim() : undefined,
      blog_url: activityType === 'Blog' ? blogUrl.trim() : undefined,
      sub_type: activityType === 'Website Update' ? 'Website Activity' : undefined,
      client_feedback: clientFeedback.trim() || undefined,
      approval_status: approvalStatus,
      priority,
      estimated_completion: estimatedCompletion || undefined,
      attached_files: attachedFiles.map(f => ({
        file_name: f.file_name,
        file_path: f.file_path,
        file_type: f.file_type,
        is_new: f.is_new
      }))
    });
  };

  const currentConfig = ACTIVITY_CONFIGS[activityType];

  return (
    <div className="bg-white border border-gray-200 rounded overflow-hidden font-sans">
      <div className="px-5 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/75">
        <div>
          <h3 className="text-xs font-bold text-black font-mono uppercase tracking-wider">
            {activityToEdit ? 'EDIT RECOGNISED WORK' : 'LOG RETAINER CONTRACT DELIVERABLE'}
          </h3>
          <p className="text-[11px] text-gray-450 text-gray-400 mt-0.5 font-sans">
            Instantly counts toward active client monthly SLA retainers
          </p>
        </div>
        <button
          onClick={onCancel}
          type="button"
          className="text-gray-400 hover:text-black p-1 rounded hover:bg-gray-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        {/* Row 1: Client & Activity Type */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-gray-400 font-bold mb-1 font-mono">
              Client Account <span className="text-red-500">*</span>
            </label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded px-3 py-2 text-xs focus:outline-none focus:border-black font-mono"
              required
            >
              <option value="" disabled>Select client...</option>
              {activeClients.map(client => (
                <option key={client.id} value={client.id}>
                  {client.client_name.toUpperCase()} (STATUS: {client.status.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-gray-400 font-bold mb-1 font-mono">
              SLA Category <span className="text-red-500">*</span>
            </label>
            <select
              value={activityType}
              onChange={(e) => setActivityType(e.target.value as ActivityType)}
              className="w-full bg-white border border-gray-200 rounded px-3 py-2 text-xs focus:outline-none focus:border-black font-mono"
            >
              {Object.keys(ACTIVITY_CONFIGS).map((type) => (
                <option key={type} value={type}>
                  {type.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 2: Workflow Stage & Activity Date */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-[10px] uppercase tracking-wider text-gray-400 font-bold font-mono">
                Workflow Status <span className="text-red-500">*</span>
              </label>
              {currentConfig && (
                <span className="text-[9px] font-mono font-bold text-green-700 bg-green-50 border border-green-100 px-1.5 py-0.2 rounded">
                  counts at: {currentConfig.completionStage.toUpperCase()}
                </span>
              )}
            </div>
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded px-3 py-2 text-xs focus:outline-none focus:border-black font-mono"
            >
              {currentConfig?.stages.map((stg) => (
                <option key={stg} value={stg}>
                  {stg.toUpperCase()} {stg === currentConfig.completionStage ? '✓ (SLA COUNTS)' : '⏱ (PENDING)'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-gray-400 font-bold mb-1 font-mono">
              Activity Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={activityDate}
              onChange={(e) => setActivityDate(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded px-3 py-2 text-xs focus:outline-none focus:border-black font-mono"
              required
            />
          </div>
        </div>

        {/* Dynamic Fields - Blog */}
        {activityType === 'Blog' && (
          <div className="p-4 bg-gray-50 rounded border border-gray-200 space-y-3">
            <h4 className="text-[10px] uppercase tracking-wider text-black font-bold font-mono">BLOG CONTENT MANIFEST</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[9px] uppercase tracking-wider text-gray-400 font-bold font-mono mb-1">
                  Draft/Final Blog Title
                </label>
                <input
                  type="text"
                  value={blogTitle}
                  onChange={(e) => setBlogTitle(e.target.value)}
                  placeholder="e.g. 5 Crucial Wellness Habits..."
                  className="w-full bg-white border border-gray-200 rounded px-3 py-2 text-xs focus:outline-none focus:border-black font-mono"
                />
              </div>
              <div>
                <label className="block text-[9px] uppercase tracking-wider text-gray-400 font-bold font-mono mb-1">
                  Live URL Link
                </label>
                <input
                  type="url"
                  value={blogUrl}
                  onChange={(e) => setBlogUrl(e.target.value)}
                  placeholder="https://client-site.com/blog/url"
                  className="w-full bg-white border border-gray-200 rounded px-3 py-2 text-xs focus:outline-none focus:border-black font-mono"
                />
              </div>
            </div>
          </div>
        )}

        {/* Deliverable/Update Title */}
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-gray-400 font-bold mb-1 font-mono">
            {activityType === 'Website Update' ? 'Update Code/Sect Title' : 'Deliverable Title'} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              activityType === 'Website Update' 
                ? 'e.g. Navigation Header Hotfix' 
                : 'e.g. Father\'s Day Promo Creative Pack'
            }
            className="w-full bg-white border border-gray-200 rounded px-3 py-2 text-xs focus:outline-none focus:border-black font-mono font-bold text-black"
            required
          />
        </div>

        {/* Description / Update Description */}
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-gray-400 font-bold mb-1 font-mono">
            {activityType === 'Website Update' ? 'Update Changelog Details' : 'Deliverable Summary & Directives'}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={
              activityType === 'Website Update' 
                ? 'Describe exactly what website templates, files or scripts were modified.' 
                : 'Brief summary of the creative approach or copy directives used.'
            }
            rows={2}
            className="w-full bg-white border border-gray-200 rounded px-3 py-2 text-xs focus:outline-none focus:border-black font-mono"
          />
        </div>

        {/* Optional Google Drive Deliverable Link */}
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-gray-400 font-bold mb-1 font-mono">
            Google Drive Deliverable Folder / File URL (Optional)
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
              <Link className="w-3.5 h-3.5" />
            </span>
            <input
              type="url"
              value={driveLink}
              onChange={(e) => setDriveLink(e.target.value)}
              placeholder="https://drive.google.com/file/d/..."
              className="w-full bg-white border border-gray-200 rounded pl-9 pr-3 py-2 text-xs focus:outline-none focus:border-black font-mono font-semibold"
            />
          </div>
          <p className="text-[10px] text-gray-400 font-sans mt-1">
            Optional: Paste direct Google Drive links to folders or cloud deliverables.
          </p>
        </div>

        {/* Native File Upload Area (Drag and Drop & Click) */}
        <div className="space-y-2">
          <label className="block text-[10px] uppercase tracking-wider text-gray-400 font-bold font-mono">
            Native File Attachments
          </label>

          {/* Interactive Drag & Drop Area */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={triggerFileSelect}
            className={`border-2 border-dashed border-gray-200 rounded-lg p-5 text-center cursor-pointer hover:border-black hover:bg-neutral-50 transition-all ${
              isDragging ? 'border-black bg-neutral-100' : 'bg-white'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              className="hidden"
              accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx,.mp4,.mov"
            />
            {isUploading ? (
              <div className="flex flex-col items-center justify-center gap-2 py-2">
                <Loader2 className="w-6 h-6 text-black animate-spin" />
                <span className="text-xs font-mono font-bold uppercase tracking-wider">Uploading asset to server...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 py-1">
                <Upload className="w-6 h-6 text-gray-400" />
                <span className="text-xs font-semibold text-black">Drag & drop asset file or click to select</span>
                <span className="text-[9px] text-gray-400 font-mono tracking-tight font-semibold">
                  Allowed: Images, Documents (PDF/Word/Excel), Videos up to 100MB
                </span>
              </div>
            )}
          </div>

          {uploadError && (
            <div className="text-[11px] font-mono text-red-650 text-red-650 font-bold bg-red-50 p-2.5 rounded border border-red-100">
              Error: {uploadError}
            </div>
          )}

          {/* List of currently uploaded attached files */}
          {attachedFiles.length > 0 && (
            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 divide-y divide-gray-150 space-y-2 max-h-[220px] overflow-y-auto">
              <div className="text-[9px] font-bold font-mono text-gray-400 uppercase pb-1">Uploaded Attachments List</div>
              {attachedFiles.map((file, idx) => {
                const isImage = file.file_type.startsWith('image/');
                const isVideo = file.file_type.startsWith('video/');
                
                return (
                  <div key={file.id || idx} className="flex justify-between items-center py-2 first:pt-1 last:pb-1">
                    <div className="flex items-center gap-2">
                      {isImage ? (
                        <ImageIcon className="w-4 h-4 text-emerald-600" />
                      ) : isVideo ? (
                        <Video className="w-4 h-4 text-blue-600" />
                      ) : (
                        <FileText className="w-4 h-4 text-amber-600" />
                      )}
                      <div>
                        <span className="text-xs font-bold text-black block truncate max-w-sm sm:max-w-md">
                          {file.file_name}
                        </span>
                        <span className="text-[9px] text-gray-400 uppercase font-mono block">
                          Type: {file.file_type} {file.is_new && <strong className="text-emerald-600">(NEW)</strong>}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachedFile(idx, file.id)}
                      className="text-gray-450 hover:text-red-700 text-gray-400 p-1 hover:bg-gray-200 rounded transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Future Proof and Remarks details */}
        <div className="border-t border-gray-200 pt-4 space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="text-[10px] uppercase tracking-wider text-gray-400 font-bold font-mono">AUDITING & COMPLIANCE METADATA</h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[9px] uppercase tracking-wider text-gray-450 text-gray-400 font-bold font-mono">Audit Status</label>
              <select
                value={approvalStatus}
                onChange={(e) => setApprovalStatus(e.target.value as any)}
                className="w-full mt-1 bg-white border border-gray-200 rounded px-2.5 py-1.5 text-xs focus:outline-none font-mono"
              >
                <option value="Pending">Pending Approval</option>
                <option value="Approved">Approved & Verified</option>
                <option value="Changes Requested">Needs Refinements</option>
              </select>
            </div>
            
            <div>
              <label className="block text-[9px] uppercase tracking-wider text-gray-450 text-gray-400 font-bold font-mono">Priority Rating</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="w-full mt-1 bg-white border border-gray-200 rounded px-2.5 py-1.5 text-xs focus:outline-none font-mono"
              >
                <option value="Low">Low Priority</option>
                <option value="Medium">Medium Priority</option>
                <option value="High">High Priority</option>
              </select>
            </div>

            <div>
              <label className="block text-[9px] uppercase tracking-wider text-gray-450 text-gray-400 font-bold font-mono">Est. Publishing</label>
              <input
                type="date"
                value={estimatedCompletion}
                onChange={(e) => setEstimatedCompletion(e.target.value)}
                className="w-full mt-1 bg-white border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-[9px] uppercase tracking-wider text-gray-400 font-bold font-mono">Internal Operator Remarks</label>
              <input
                type="text"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Manager internal comments"
                className="w-full mt-1 bg-white border border-gray-200 rounded px-3 py-2 text-xs focus:outline-none focus:border-black font-mono"
              />
            </div>
            <div>
              <label className="block text-[9px] uppercase tracking-wider text-gray-400 font-bold font-mono">Client Direct Reactions</label>
              <input
                type="text"
                value={clientFeedback}
                onChange={(e) => setClientFeedback(e.target.value)}
                placeholder="Direct feedback from WhatsApp/Slack logs"
                className="w-full mt-1 bg-white border border-gray-200 rounded px-3 py-2 text-xs focus:outline-none focus:border-black font-mono"
              />
            </div>
          </div>
        </div>

        {/* Save button and Action indicators */}
        <div className="flex justify-end items-center gap-3 border-t border-gray-200 pt-4 mt-6">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-200 bg-white hover:bg-gray-50 rounded text-xs font-bold font-mono text-black transition-colors"
          >
            CANCEL
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-black hover:bg-neutral-800 text-white rounded text-xs font-bold font-mono flex items-center gap-1 transition-colors shadow-xs"
          >
            <Check className="w-4 h-4" />
            {activityToEdit ? 'SAVE CHANGES' : 'COMMIT DELIVERABLE'}
          </button>
        </div>
      </form>
    </div>
  );
}
