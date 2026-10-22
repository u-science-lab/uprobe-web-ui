import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,

  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Paper,
  Divider,
  CircularProgress,
  Fab,
  Tooltip,
  Breadcrumbs,
  Link,
  useTheme,
  useMediaQuery,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  InputAdornment,
  OutlinedInput,
  Chip,
  Stack,
  LinearProgress,
  Menu,
} from '@mui/material';
import {
  Folder as FolderIcon,
  InsertDriveFile as FileIcon,
  Add as AddIcon,
  Upload as UploadIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
  CreateNewFolder as CreateFolderIcon,
  Refresh as RefreshIcon,
  Home as HomeIcon,
  NavigateNext as NavigateNextIcon,
  Search as SearchIcon,

  CloudUpload as CloudUploadIcon,
  FolderOpen as FolderOpenIcon,
  ArrowBack as ArrowBackIcon,
} from '@mui/icons-material';
import { useGenomeData } from '../hooks/useGenomeData';
import { useNotification } from '../hooks/useNotification';

interface FileItem {
  name: string;
  type: 'file' | 'folder';
  size?: number;
  modified?: string;
  path: string;
  fullPath: string;
  isDirectory?: boolean;
  extension?: string;
  children?: FileItem[];
  isPreset?: boolean;
  canDelete?: boolean;
}

interface GenomeItem {
  name: string;
  isPublic: boolean;
}

const Genome: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const {
    genomes,
    selectedGenome,
    genomeFiles,
    isLoading,
    setSelectedGenome,
    setGenomeFiles,
    fetchGenomes,
    fetchGenomeFiles,
    uploadGenomeFile,
    deleteGenomeFile,
    downloadGenomeFile,
    getFileMetadata,
    addGenome,
    deleteGenome,
  } = useGenomeData();

  const { showNotification } = useNotification();

  const [currentPath, setCurrentPath] = useState<string[]>([]);
  const [fileItems, setFileItems] = useState<FileItem[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [showAddGenomeDialog, setShowAddGenomeDialog] = useState(false);
  const [newGenomeName, setNewGenomeName] = useState('');
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredItems, setFilteredItems] = useState<FileItem[]>([]);
  const [showDeleteGenomeDialog, setShowDeleteGenomeDialog] = useState(false);
  const [genomeToDelete, setGenomeToDelete] = useState<string>('');
  const [genomeList, setGenomeList] = useState<GenomeItem[]>([]);
  const [showCreateFolderDialog, setShowCreateFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [sortBy] = useState<'name' | 'size' | 'modified'>('name');
  const [sortOrder] = useState<'asc' | 'desc'>('asc');
  const [contextMenu, setContextMenu] = useState<{ mouseX: number; mouseY: number; item?: FileItem } | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Load genomes on component mount
  useEffect(() => {
    fetchGenomes();
  }, [fetchGenomes]);

  // Convert genomes to GenomeItem format
  useEffect(() => {
    const items = genomes.map(genome => ({
      name: genome.name,
      isPublic: genome.is_public
    }));
    setGenomeList(items);
  }, [genomes]);

  const handleDeleteGenome = async () => {
    if (!genomeToDelete) return;
    
    const genomeItem = genomeList.find(g => g.name === genomeToDelete);
    if (!genomeItem || genomeItem.isPublic) {
      showNotification('Cannot delete public genome', 'error');
      return;
    }

    try {
      await deleteGenome(genomeToDelete);
      setShowDeleteGenomeDialog(false);
      setGenomeToDelete('');
      showNotification('Genome deleted successfully', 'success');
      
      // If the deleted genome was selected, clear the selection
      if (selectedGenome === genomeToDelete) {
        setSelectedGenome('');
      }
    } catch (error) {
      showNotification('Failed to delete genome', 'error');
    }
  };

  // Load files when genome is selected
  useEffect(() => {
    if (selectedGenome) {
      // Clear old data immediately to prevent rendering old files with new genome name
      setGenomeFiles([]);
      setFileItems([]);
      setFilteredItems([]);
      fetchGenomeFiles(selectedGenome);
    }
  }, [selectedGenome, fetchGenomeFiles]);

  // Convert API files to FileItem format with folder structure
  useEffect(() => {
    if (genomeFiles && selectedGenome) {
      // Only build structure if we have files, otherwise clear items
      if (genomeFiles.length > 0) {
        buildFileStructureWithMetadata(genomeFiles, currentPath, selectedGenome);
      } else {
        setFileItems([]);
        setFilteredItems([]);
      }
    }
  }, [genomeFiles, currentPath, selectedGenome]);

  // Build file structure with metadata
  const buildFileStructureWithMetadata = async (files: string[], currentPath: string[], genomeName: string) => {
    const items = buildFileStructure(files, currentPath);
    
    // Get metadata for each file and folder
    const itemsWithMetadata = await Promise.all(
      items.map(async (item) => {
        if (item.type === 'file') {
          const metadata = await getFileMetadata(genomeName, item.fullPath);
          if (metadata) {
            return {
              ...item,
              size: metadata.size,
              modified: metadata.modified,
              isPreset: metadata.is_preset,
              canDelete: metadata.can_delete
            };
          }
        } else if (item.type === 'folder') {
          // For folders, check if they contain preset files to determine if they are preset folders
          const folderFiles = files.filter(file => file.startsWith(item.fullPath + '/'));
          let isPresetFolder = false;
          let canDeleteFolder = true;
          
          for (const file of folderFiles) {
            const metadata = await getFileMetadata(genomeName, file);
            if (metadata && metadata.is_preset) {
              isPresetFolder = true;
              canDeleteFolder = false;
              break;
            }
          }
          
          return {
            ...item,
            isPreset: isPresetFolder,
            canDelete: canDeleteFolder
          };
        }
        return item;
      })
    );
    
    setFileItems(itemsWithMetadata);
    setFilteredItems(itemsWithMetadata);
  };

  // Build hierarchical file structure
  const buildFileStructure = (files: string[], currentPath: string[]): FileItem[] => {
    const currentPathStr = currentPath.join('/');
    const items: FileItem[] = [];
    const folders = new Set<string>();
    
    files.forEach(file => {
      const parts = file.split('/');
      
      if (currentPath.length === 0) {
        // Root level
        if (parts.length === 1) {
          // File in root
          if (file !== '.gitkeep') {
            items.push({
              name: file,
              type: 'file',
              size: 0,
              modified: new Date().toISOString(),
              path: file,
              fullPath: file,
              extension: getFileExtension(file)
            });
          }
        } else {
          // File in subfolder, add folder if not exists
          const folderName = parts[0];
          if (!folders.has(folderName)) {
            folders.add(folderName);
            items.push({
              name: folderName,
              type: 'folder',
              path: folderName,
              fullPath: folderName,
              isDirectory: true
            });
          }
        }
      } else {
        // In subfolder
        if (file.startsWith(currentPathStr + '/')) {
          const relativePath = file.substring(currentPathStr.length + 1);
          const relativeParts = relativePath.split('/');
          
          if (relativeParts.length === 1) {
            // Direct file in current folder
            if (relativePath !== '.gitkeep') {
              items.push({
                name: relativePath,
                type: 'file',
                size: 0,
                modified: new Date().toISOString(),
                path: relativePath,
                fullPath: file,
                extension: getFileExtension(relativePath)
              });
            }
          } else {
            // File in subfolder
            const folderName = relativeParts[0];
            if (!folders.has(folderName)) {
              folders.add(folderName);
              items.push({
                name: folderName,
                type: 'folder',
                path: folderName,
                fullPath: currentPathStr + '/' + folderName,
                isDirectory: true
              });
            }
          }
        }
      }
    });
    
    return sortItems(items);
  };



  const getFileExtension = (fileName: string): string => {
    return fileName.split('.').pop()?.toLowerCase() || '';
  };

  const sortItems = (items: FileItem[]): FileItem[] => {
    return [...items].sort((a, b) => {
      // Folders first
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
      }
      
      let comparison = 0;
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'size':
          comparison = (a.size || 0) - (b.size || 0);
          break;
        case 'modified':
          comparison = new Date(a.modified || 0).getTime() - new Date(b.modified || 0).getTime();
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  };

  const handleGenomeSelect = (genomeName: string) => {
    setSelectedGenome(genomeName);
    setGenomeFiles([]);
    setSelectedFiles(new Set());
    setFileItems([]);
    setFilteredItems([]);
    setCurrentPath([]);
  };

  const handleFileSelect = (fileName: string) => {
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(fileName)) {
      newSelected.delete(fileName);
    } else {
      newSelected.add(fileName);
    }
    setSelectedFiles(newSelected);
  };

  const handleFolderClick = (folderName: string) => {
    const newPath = [...currentPath, folderName];
    setCurrentPath(newPath);
    setSelectedFiles(new Set());
  };

  const handleNavigateUp = () => {
    if (currentPath.length > 0) {
      const newPath = currentPath.slice(0, -1);
      setCurrentPath(newPath);
      setSelectedFiles(new Set());
    }
  };

  const handleBreadcrumbClick = (index: number) => {
    const newPath = currentPath.slice(0, index + 1);
    setCurrentPath(newPath);
    setSelectedFiles(new Set());
  };

  const handleContextMenu = (event: React.MouseEvent, item?: FileItem) => {
    event.preventDefault();
    setContextMenu({
      mouseX: event.clientX - 2,
      mouseY: event.clientY - 4,
      item
    });
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  const handleFileDownload = async (fileName: string) => {
    if (!selectedGenome) return;
    try {
      await downloadGenomeFile(selectedGenome, fileName);
    } catch (error) {
      showNotification('Failed to download file', 'error');
    }
  };

  const handleFileDelete = async (fileName: string) => {
    if (!selectedGenome) return;
    
    // Check file permissions
    const item = fileItems.find(f => f.fullPath === fileName);
    if (item && item.isPreset) {
      showNotification('Cannot delete preset files', 'error');
      return;
    }
    
    try {
      await deleteGenomeFile(selectedGenome, fileName);
      showNotification('File deleted successfully', 'success');
      fetchGenomeFiles(selectedGenome); // Refresh the file list
    } catch (error: any) {
      if (error.response?.status === 403) {
        showNotification('Cannot delete preset files', 'error');
      } else {
        showNotification('Failed to delete file', 'error');
      }
    }
  };

  const handleFolderDelete = async (folderPath: string) => {
    if (!selectedGenome) return;
    
    // Check folder permissions
    const folderItem = fileItems.find(f => f.fullPath === folderPath);
    if (folderItem && folderItem.isPreset) {
      showNotification('Cannot delete preset folders', 'error');
      return;
    }
    
    try {
      // Delete all files in the folder
      const folderFiles = fileItems.filter(item => 
        item.path?.startsWith(folderPath) || item.name.startsWith(folderPath)
      );
      
      // Check if folder contains preset files
      const hasPresetFiles = folderFiles.some(file => file.isPreset);
      if (hasPresetFiles) {
        showNotification('Cannot delete folders containing preset files', 'error');
        return;
      }
      
      for (const file of folderFiles) {
        await deleteGenomeFile(selectedGenome, file.name);
      }
      
      showNotification('Folder deleted successfully', 'success');
      fetchGenomeFiles(selectedGenome); // Refresh the file list
    } catch (error: any) {
      if (error.response?.status === 403) {
        showNotification('Cannot delete preset folders', 'error');
      } else {
        showNotification('Failed to delete folder', 'error');
      }
    }
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setFilteredItems(fileItems);
      return;
    }
    
    const filtered = fileItems.filter(item =>
      item.name.toLowerCase().includes(query.toLowerCase())
    );
    setFilteredItems(filtered);
  };

  const handleAddGenome = async () => {
    if (!newGenomeName.trim()) return;
    try {
      await addGenome(newGenomeName.trim());
      setShowAddGenomeDialog(false);
      setNewGenomeName('');
    } catch (error) {
      showNotification('Failed to add genome', 'error');
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !selectedGenome) return;
    
    try {
      // Create a placeholder file in the folder to ensure it exists
      const folderPath = currentPath.length > 0 
        ? `${currentPath.join('/')}/${newFolderName.trim()}` 
        : newFolderName.trim();
      
      const placeholderFile = new File([''], `${folderPath}/.gitkeep`, { type: 'text/plain' });
      await uploadGenomeFile(selectedGenome, placeholderFile);
      
      setShowCreateFolderDialog(false);
      setNewFolderName('');
      showNotification('Folder created successfully', 'success');
      fetchGenomeFiles(selectedGenome);
    } catch (error) {
      showNotification('Failed to create folder', 'error');
    }
  };

  const handleFileUpload = async () => {
    if (!selectedGenome || uploadFiles.length === 0) return;
    
    setIsUploading(true);
    try {
      for (const file of uploadFiles) {
        setUploadProgress(prev => ({ ...prev, [file.name]: 0 }));
        
        // Handle folder structure in file path
        let uploadFile = file;
        if (currentPath.length > 0) {
          const folderPath = currentPath.join('/');
          const newFileName = `${folderPath}/${file.name}`;
          uploadFile = new File([file], newFileName, { type: file.type });
        }
        
        await uploadGenomeFile(selectedGenome, uploadFile);
        setUploadProgress(prev => ({ ...prev, [file.name]: 100 }));
      }
      setShowUploadDialog(false);
      setUploadFiles([]);
      setUploadProgress({});
      showNotification('Files uploaded successfully', 'success');
      fetchGenomeFiles(selectedGenome);
    } catch (error) {
      showNotification('Failed to upload files', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setUploadFiles(files);
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files);
    setUploadFiles(files);
    setShowUploadDialog(true);
  };



  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <Container maxWidth={false} sx={{ py: 3 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 600 }}>
          🧬 Genome Browser
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Browse and manage genome files for probe design
        </Typography>
      </Box>

      <Grid container spacing={3}>
        {/* Header with Genome Selection and Search */}
        <Grid item xs={12}>
          <Card elevation={2} sx={{ mb: 3 }}>
            <CardContent>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} lg={4}>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    <FormControl fullWidth size="small" sx={{ flex: '1 1 160px', minWidth: 0 }}>
                      <InputLabel id="genome-select-label">Select Genome</InputLabel>
                      <Select
                        labelId="genome-select-label"
                        value={selectedGenome || ''}
                        onChange={(e) => handleGenomeSelect(e.target.value)}
                        label="Select Genome"
                      >
                        {genomeList.map((genome) => (
                          <MenuItem 
                            key={genome.name} 
                            value={genome.name}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <FolderIcon 
                                fontSize="small" 
                                color={selectedGenome === genome.name ? 'primary' : 'inherit'}
                              />
                              <Typography>
                                {genome.name}
                                {genome.isPublic ? (
                                  <Typography
                                    component="span"
                                    variant="caption"
                                    sx={{
                                      ml: 1,
                                      px: 1,
                                      py: 0.2,
                                      bgcolor: 'primary.light',
                                      color: 'primary.contrastText',
                                      borderRadius: 1,
                                      fontSize: '0.7rem'
                                    }}
                                  >
                                    Public
                                  </Typography>
                                ) : (
                                  <Typography
                                    component="span"
                                    variant="caption"
                                    sx={{
                                      ml: 1,
                                      px: 1,
                                      py: 0.2,
                                      bgcolor: 'success.light',
                                      color: 'success.contrastText',
                                      borderRadius: 1,
                                      fontSize: '0.7rem'
                                    }}
                                  >
                                    Private
                                  </Typography>
                                )}
                              </Typography>
                            </Box>
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => setShowAddGenomeDialog(true)}
                        startIcon={<AddIcon />}
                        sx={{ minWidth: 'auto', whiteSpace: 'nowrap' }}
                      >
                        Add
                      </Button>
                      {selectedGenome && !genomeList.find(g => g.name === selectedGenome)?.isPublic && (
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => {
                            setGenomeToDelete(selectedGenome);
                            setShowDeleteGenomeDialog(true);
                          }}
                          startIcon={<DeleteIcon />}
                          color="error"
                          sx={{ minWidth: 'auto', whiteSpace: 'nowrap' }}
                        >
                          Delete
                        </Button>
                      )}
                    </Box>
                  </Box>
                </Grid>
                <Grid item xs={12} lg={8}>
                  <FormControl fullWidth size="small">
                    <OutlinedInput
                      placeholder="Search files..."
                      value={searchQuery}
                      onChange={(e) => handleSearch(e.target.value)}
                      startAdornment={
                        <InputAdornment position="start">
                          <SearchIcon />
                        </InputAdornment>
                      }
                    />
                  </FormControl>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* File Browser Panel */}
        <Grid item xs={12}>
          <Card elevation={2}>
            <CardContent>
              {selectedGenome ? (
                <>
                  {/* Header with breadcrumbs and actions */}
                  <Box sx={{ mb: 2 }}>
                    {/* Navigation and Path & Actions */}
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: '1 1 180px', minWidth: 0 }}>
                        {currentPath.length > 0 && (
                          <Tooltip title="Back">
                            <IconButton size="small" onClick={handleNavigateUp}>
                              <ArrowBackIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />} sx={{ flex: 1 }}>
                          <Link
                            component="button"
                            variant="body2"
                            onClick={() => setCurrentPath([])}
                            sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                          >
                            <HomeIcon fontSize="small" />
                            {selectedGenome}
                          </Link>
                          {currentPath.map((path, index) => (
                            <Link
                              key={index}
                              component="button"
                              variant="body2"
                              onClick={() => handleBreadcrumbClick(index)}
                            >
                              {path}
                            </Link>
                          ))}
                        </Breadcrumbs>
                      </Box>
                      
                      {/* Right Actions */}
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <Tooltip title="Refresh">
                          <IconButton size="small" onClick={() => fetchGenomeFiles(selectedGenome)}>
                            <RefreshIcon />
                          </IconButton>
                        </Tooltip>
                        <Button
                          variant="contained"
                          size="small"
                          startIcon={<CloudUploadIcon />}
                          onClick={() => setShowUploadDialog(true)}
                          disabled={isUploading}
                          sx={{ 
                            minWidth: 120,
                            fontWeight: 600
                          }}
                        >
                          Upload FASTA / GTF
                        </Button>
                      </Box>
                    </Box>

                    {/* Action Buttons */}
                    {selectedFiles.size > 0 && (
                      <Box sx={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', mb: 2 }}>
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<DownloadIcon />}
                            onClick={() => {
                              selectedFiles.forEach(fileName => {
                                const item = fileItems.find(f => f.name === fileName);
                                if (item && item.type === 'file') {
                                  handleFileDownload(item.fullPath);
                                }
                              });
                            }}
                          >
                            Download ({selectedFiles.size})
                          </Button>
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<DeleteIcon />}
                            color="error"
                            onClick={() => {
                              // Check if selected items contain preset files or folders
                              const selectedItems = Array.from(selectedFiles).map(fileName => 
                                fileItems.find(f => f.name === fileName)
                              ).filter(Boolean);
                              
                              const hasPresetItems = selectedItems.some(item => item?.isPreset || item?.canDelete === false);
                              
                              if (hasPresetItems) {
                                showNotification('Cannot delete preset files or folders', 'error');
                                return;
                              }
                              
                              if (window.confirm(`Delete ${selectedFiles.size} selected items?`)) {
                                selectedFiles.forEach(fileName => {
                                  const item = fileItems.find(f => f.name === fileName);
                                  if (item && item.canDelete !== false && !item.isPreset) {
                                    if (item.type === 'file') {
                                      handleFileDelete(item.fullPath);
                                    } else {
                                      handleFolderDelete(item.fullPath);
                                    }
                                  }
                                });
                                setSelectedFiles(new Set());
                              }
                            }}
                          >
                            Delete ({selectedFiles.size})
                          </Button>
                        </Box>
                      </Box>
                    )}
                    
                    {/* File Stats */}
                    <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Typography variant="body2" color="text.secondary">
                          {fileItems.filter(f => f.type === 'folder').length} folders, {fileItems.filter(f => f.type === 'file').length} files
                        </Typography>
                        {selectedFiles.size > 0 && (
                          <Typography variant="body2" color="primary.main" sx={{ fontWeight: 600 }}>
                            {selectedFiles.size} selected
                          </Typography>
                        )}
                      </Box>
                      
                      {/* Quick Tips */}
                      <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                        💡 Tip: Right-click for more options
                      </Typography>
                    </Box>
                  </Box>

                  <Divider sx={{ mb: 2 }} />

                  {/* File List */}
                  <Box 
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onContextMenu={(e) => handleContextMenu(e)}
                    sx={{ 
                      minHeight: 300,
                      overflowX: 'auto',
                      border: '2px dashed transparent',
                      borderRadius: 1,
                      transition: 'border-color 0.2s',
                      '&:hover': {
                        borderColor: theme.palette.primary.light,
                      }
                    }}
                  >
                    {isLoading ? (
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4 }}>
                        <CircularProgress />
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                          Loading files...
                        </Typography>
                      </Box>
                    ) : (searchQuery ? filteredItems : fileItems).length > 0 ? (
                      <Box sx={{ minWidth: 640, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                        {/* Table Header */}
                        <Box 
                          sx={{ 
                            display: 'flex', 
                            alignItems: 'center',
                            px: 2,
                            py: 1,
                            bgcolor: 'grey.50',
                            borderBottom: '1px solid',
                            borderColor: 'divider',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            color: 'text.secondary'
                          }}
                        >
                          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              Name
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              (Click to select, double-click folder to open)
                            </Typography>
                          </Box>
                          <Box sx={{ width: 120, textAlign: 'center' }}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              Size
                            </Typography>
                          </Box>
                          <Box sx={{ width: 140, textAlign: 'center' }}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              Modified
                            </Typography>
                          </Box>
                          <Box sx={{ width: 100, textAlign: 'center' }}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              Actions
                            </Typography>
                          </Box>
                        </Box>

                        {/* File List */}
                        {(searchQuery ? filteredItems : fileItems).map((item, index) => (
                          <Box
                            key={item.name}
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              px: 2,
                              py: 1.5,
                              borderBottom: index < (searchQuery ? filteredItems : fileItems).length - 1 ? '1px solid' : 'none',
                              borderColor: 'divider',
                              cursor: 'pointer',
                              bgcolor: selectedFiles.has(item.name) ? 'primary.light' : 'transparent',
                              '&:hover': {
                                bgcolor: selectedFiles.has(item.name) ? 'primary.light' : 'action.hover',
                              },
                              transition: 'background-color 0.2s'
                            }}
                            onClick={() => {
                              if (item.type === 'folder') {
                                handleFolderClick(item.name);
                              } else {
                                handleFileSelect(item.name);
                              }
                            }}
                            onDoubleClick={() => {
                              if (item.type === 'folder') {
                                handleFolderClick(item.name);
                              }
                            }}
                            onContextMenu={(e) => handleContextMenu(e, item)}
                          >
                            {/* File Name */}
                            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                              {item.type === 'folder' ? (
                                <FolderIcon sx={{ color: 'primary.main', fontSize: '1.2rem' }} />
                              ) : (
                                <FileIcon sx={{ color: 'text.secondary', fontSize: '1.2rem' }} />
                              )}
                              <Box>
                                <Typography 
                                  variant="body2" 
                                  sx={{ 
                                    fontWeight: item.type === 'folder' ? 600 : 400,
                                    color: item.type === 'folder' ? 'primary.main' : 'text.primary'
                                  }}
                                >
                                  {item.name}
                                </Typography>
                              </Box>
                            </Box>

                            {/* File Size */}
                            <Box sx={{ width: 120, textAlign: 'center' }}>
                              <Typography variant="body2" color="text.secondary">
                                {item.type === 'folder' ? '—' : (
                                  item.size ? formatFileSize(item.size) : '—'
                                )}
                              </Typography>
                            </Box>

                            {/* Modified Date */}
                            <Box sx={{ width: 140, textAlign: 'center' }}>
                              <Typography variant="body2" color="text.secondary">
                                {item.modified ? new Date(item.modified).toLocaleDateString() : '—'}
                              </Typography>
                            </Box>

                            {/* Actions */}
                            <Box sx={{ width: 100, display: 'flex', justifyContent: 'center', gap: 0.5 }}>
                              {item.type === 'file' ? (
                                <>
                                  <Tooltip title="Download file">
                                    <IconButton 
                                      size="small"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleFileDownload(item.fullPath);
                                      }}
                                    >
                                      <DownloadIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                  {item.canDelete !== false && (
                                    <Tooltip title="Delete file">
                                      <IconButton 
                                        size="small"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (window.confirm(`Delete ${item.name}?`)) {
                                            handleFileDelete(item.fullPath);
                                          }
                                        }}
                                        sx={{ color: 'error.main' }}
                                      >
                                        <DeleteIcon fontSize="small" />
                                      </IconButton>
                                    </Tooltip>
                                  )}
                                </>
                              ) : (
                                <>
                                  <Tooltip title="Open folder">
                                    <IconButton 
                                      size="small"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleFolderClick(item.name);
                                      }}
                                    >
                                      <FolderOpenIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                  {item.canDelete !== false && (
                                    <Tooltip title="Delete folder">
                                      <IconButton 
                                        size="small"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (window.confirm(`Delete folder ${item.name}?`)) {
                                            handleFolderDelete(item.fullPath);
                                          }
                                        }}
                                        sx={{ color: 'error.main' }}
                                      >
                                        <DeleteIcon fontSize="small" />
                                      </IconButton>
                                    </Tooltip>
                                  )}
                                </>
                              )}
                            </Box>
                          </Box>
                        ))}
                      </Box>
                    ) : (
                      <Box sx={{ 
                        textAlign: 'center', 
                        py: 6,
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 1,
                        bgcolor: 'grey.25'
                      }}>
                        {searchQuery ? (
                          <>
                            <SearchIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                            <Typography variant="h6" color="text.secondary" gutterBottom>
                              No files match your search
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Try adjusting your search terms or browse all files
                            </Typography>
                          </>
                        ) : selectedGenome ? (
                          currentPath.length > 0 ? (
                            <>
                              <FolderIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                              <Typography variant="h6" color="text.secondary" gutterBottom>
                                This folder is empty
                              </Typography>
                              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                                Upload files to this folder or create subfolders to organize your data
                              </Typography>
                              <Stack direction="row" spacing={2} justifyContent="center">
                                <Button
                                  variant="contained"
                                  startIcon={<CloudUploadIcon />}
                                  onClick={() => setShowUploadDialog(true)}
                                >
                                  Upload FASTA / GTF
                                </Button>
                              </Stack>
                            </>
                          ) : (
                            <>
                              <CloudUploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                              <Typography variant="h6" color="text.secondary" gutterBottom>
                                No files in this genome
                              </Typography>
                              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                                Start by uploading genome files (.fa, .fasta, .gtf, etc.)
                              </Typography>
                              <Stack direction="row" spacing={2} justifyContent="center">
                                <Button
                                  variant="contained"
                                  startIcon={<CloudUploadIcon />}
                                  onClick={() => setShowUploadDialog(true)}
                                >
                                  Upload FASTA / GTF
                                </Button>
                              </Stack>
                            </>
                          )
                        ) : (
                          <>
                            <FolderIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                            <Typography variant="h6" color="text.secondary" gutterBottom>
                              Select a genome to browse files
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Choose a genome from the dropdown above to view and manage its files
                            </Typography>
                          </>
                        )}
                      </Box>
                    )}
                  </Box>

                  {/* Context Menu */}
                  <Menu
                    open={contextMenu !== null}
                    onClose={handleCloseContextMenu}
                    anchorReference="anchorPosition"
                    anchorPosition={
                      contextMenu !== null
                        ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
                        : undefined
                    }
                  >
                    {contextMenu?.item ? (
                      <>
                        {contextMenu.item.type === 'folder' ? (
                          <MenuItem key="open" onClick={() => {
                            handleFolderClick(contextMenu.item!.name);
                            handleCloseContextMenu();
                          }}>
                            <ListItemIcon>
                              <FolderOpenIcon fontSize="small" />
                            </ListItemIcon>
                            <ListItemText>Open</ListItemText>
                          </MenuItem>
                        ) : (
                          <MenuItem key="download" onClick={() => {
                            handleFileDownload(contextMenu.item!.fullPath);
                            handleCloseContextMenu();
                          }}>
                            <ListItemIcon>
                              <DownloadIcon fontSize="small" />
                            </ListItemIcon>
                            <ListItemText>Download</ListItemText>
                          </MenuItem>
                        )}
                        {contextMenu.item.canDelete !== false && !contextMenu.item.isPreset && (
                          <MenuItem key="delete" onClick={() => {
                            const item = contextMenu.item!;
                            if (window.confirm(`Delete ${item.name}?`)) {
                              if (item.type === 'folder') {
                                handleFolderDelete(item.fullPath);
                              } else {
                                handleFileDelete(item.fullPath);
                              }
                            }
                            handleCloseContextMenu();
                          }}>
                            <ListItemIcon>
                              <DeleteIcon fontSize="small" color="error" />
                            </ListItemIcon>
                            <ListItemText>Delete</ListItemText>
                          </MenuItem>
                        )}
                      </>
                    ) : (
                      <>
                        <MenuItem key="upload" onClick={() => {
                          setShowUploadDialog(true);
                          handleCloseContextMenu();
                        }}>
                          <ListItemIcon>
                            <CloudUploadIcon fontSize="small" />
                          </ListItemIcon>
                          <ListItemText>Upload FASTA / GTF</ListItemText>
                        </MenuItem>
                        <MenuItem key="newfolder" onClick={() => {
                          setShowCreateFolderDialog(true);
                          handleCloseContextMenu();
                        }}>
                          <ListItemIcon>
                            <CreateFolderIcon fontSize="small" />
                          </ListItemIcon>
                          <ListItemText>New Folder</ListItemText>
                        </MenuItem>
                      </>
                    )}
                  </Menu>
                </>
              ) : (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography variant="body1" color="text.secondary" gutterBottom>
                    Select a genome to browse files
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Add Genome Dialog */}
      <Dialog open={showAddGenomeDialog} onClose={() => setShowAddGenomeDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add New Genome</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Genome Name"
            fullWidth
            variant="outlined"
            value={newGenomeName}
            onChange={(e) => setNewGenomeName(e.target.value)}
            placeholder="Enter genome name (e.g., hg38, mm10)"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowAddGenomeDialog(false)}>Cancel</Button>
          <Button onClick={handleAddGenome} variant="contained" disabled={!newGenomeName.trim()}>
            Add Genome
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Genome Confirmation Dialog */}
      <Dialog
        open={showDeleteGenomeDialog}
        onClose={() => {
          setShowDeleteGenomeDialog(false);
          setGenomeToDelete('');
        }}
      >
        <DialogTitle>Delete Genome</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the genome "{genomeToDelete}"? This action cannot be undone.
          </Typography>
          <Typography color="error" sx={{ mt: 2 }}>
            Warning: All files associated with this genome will be deleted.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setShowDeleteGenomeDialog(false);
              setGenomeToDelete('');
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDeleteGenome}
            variant="contained"
            color="error"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create Folder Dialog */}
      <Dialog open={showCreateFolderDialog} onClose={() => setShowCreateFolderDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Folder</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Folder Name"
            fullWidth
            variant="outlined"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Enter folder name"
            helperText={currentPath.length > 0 ? `Will be created in: ${currentPath.join('/')}` : 'Will be created in root directory'}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setShowCreateFolderDialog(false);
            setNewFolderName('');
          }}>Cancel</Button>
          <Button onClick={handleCreateFolder} variant="contained" disabled={!newFolderName.trim()}>
            Create Folder
          </Button>
        </DialogActions>
      </Dialog>

      {/* Upload Files Dialog */}
      <Dialog open={showUploadDialog} onClose={() => setShowUploadDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CloudUploadIcon />
            Upload FASTA / GTF to {selectedGenome}
            {currentPath.length > 0 && (
              <Chip size="small" label={`/${currentPath.join('/')}`} variant="outlined" />
            )}
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 2 }}>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".fa,.fasta,.fna,.gtf,.gff"
              style={{ display: 'none' }}
              onChange={handleFileInputChange}
            />
            
            <Typography variant="body2" color="warning.main" sx={{ mb: 2, textAlign: 'center' }}>
              Note: Only FASTA (.fa, .fasta, .fna) and GTF/GFF files are supported. If you need other files or indices, please contact the author.
            </Typography>

            {/* Upload Area */}
            <Box 
              sx={{ 
                border: '2px dashed',
                borderColor: 'primary.main',
                borderRadius: 2,
                p: 4,
                textAlign: 'center',
                bgcolor: 'primary.light',
                color: 'primary.contrastText',
                mb: 2,
                cursor: 'pointer',
                transition: 'all 0.2s',
                '&:hover': {
                  bgcolor: 'primary.main',
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <CloudUploadIcon sx={{ fontSize: 48, mb: 1 }} />
              <Typography variant="h6" gutterBottom>
                Drag & Drop FASTA/GTF Files Here
              </Typography>
              <Typography variant="body2">
                or click to select files
              </Typography>
            </Box>
            
            <Box sx={{ display: 'flex', gap: 2, mb: 2, justifyContent: 'center' }}>
              <Button
                variant="outlined"
                startIcon={<UploadIcon />}
                onClick={() => fileInputRef.current?.click()}
              >
                Select FASTA / GTF Files
              </Button>
            </Box>

            {uploadFiles.length > 0 && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    Selected Files ({uploadFiles.length})
                  </Typography>
                  <Button 
                    size="small" 
                    onClick={() => setUploadFiles([])}
                    startIcon={<DeleteIcon />}
                  >
                    Clear All
                  </Button>
                </Box>
                {isUploading && (
                  <Box sx={{ mb: 2 }}>
                    <LinearProgress />
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                      Uploading files...
                    </Typography>
                  </Box>
                )}
                <List dense sx={{ maxHeight: 300, overflow: 'auto' }}>
                  {uploadFiles.map((file, index) => (
                    <ListItem key={index}>
                      <ListItemIcon>
                        <FileIcon fontSize="small" />
                      </ListItemIcon>
                      <ListItemText
                        primary={file.name}
                        secondary={formatFileSize(file.size)}
                      />
                      {uploadProgress[file.name] !== undefined && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <CircularProgress size={20} variant="determinate" value={uploadProgress[file.name]} />
                          <Typography variant="caption">
                            {uploadProgress[file.name]}%
                          </Typography>
                        </Box>
                      )}
                    </ListItem>
                  ))}
                </List>
              </Paper>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setShowUploadDialog(false);
            setUploadFiles([]);
            setUploadProgress({});
          }}>Cancel</Button>
          <Button 
            onClick={handleFileUpload} 
            variant="contained" 
            disabled={uploadFiles.length === 0 || isUploading}
            startIcon={isUploading ? <CircularProgress size={16} /> : <CloudUploadIcon />}
          >
            {isUploading ? 'Uploading...' : `Upload ${uploadFiles.length} Files`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Floating Action Button for mobile */}
      {isMobile && selectedGenome && (
        <Fab
          color="primary"
          aria-label="upload"
          sx={{ position: 'fixed', bottom: 16, right: 16 }}
          onClick={() => setShowUploadDialog(true)}
        >
          <UploadIcon />
        </Fab>
      )}
    </Container>
  );
};

export default Genome; 
