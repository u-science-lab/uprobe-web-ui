// App.tsx
import React from 'react';
import { AppBar, Toolbar, Button, Box, IconButton, useMediaQuery, Drawer, Divider, List, ListItemButton, ListItemIcon, ListItemText, Typography, Tooltip, alpha } from '@mui/material';
import { BrowserRouter as Router, Route, Routes, useNavigate, useLocation, Navigate, Outlet } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import HomeIcon from '@mui/icons-material/Home';
import DesignIcon from '@mui/icons-material/Pinch';
import GenomeIcon from '@mui/icons-material/Dataset';
import TaskIcon from '@mui/icons-material/List';
import TutorialIcon from '@mui/icons-material/HelpOutline';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import ContactMailIcon from '@mui/icons-material/ContactMail';
import GitHubIcon from '@mui/icons-material/GitHub';
import LanguageIcon from '@mui/icons-material/Language';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useThemeContext } from './contexts/ThemeContext';

import Home from './pages/Home';
import Design from './pages/Design';
import Genome from './pages/Genome';
import Task from './pages/Task';
import Tutorial from './pages/Tutorial';
import Auth from './pages/Auth';
import Agent from './pages/Agent';

import Layout from './components/common/Layout';
import AccountMenu from './components/users/AccountMenu';
import Profile from './components/users/Profile';
import Settings from './components/users/Settings';
import Logout from './components/users/Logout';
import CustomProbe from './pages/CustomProbe';
import DesignWorkflow from './pages/DesignWorkflow';
import NotFound from './components/common/NotFound';

import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';

const CONTACT_EMAIL = 'jshn20001017@gmail.com';
const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('U-Probe inquiry')}`;

const PROJECT_LINKS = [
  { label: 'Website', href: 'https://www.u-probe.org/', icon: LanguageIcon },
  { label: 'GitHub', href: 'https://github.com/u-science-lab/U-Probe', icon: GitHubIcon },
];

// Protected Route component
const ProtectedRoute = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <Box 
        sx={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '100vh' 
        }}
      >
        <Typography>Loading...</Typography>
      </Box>
    );
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  return <Outlet />;
};

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const { mode, toggleTheme } = useThemeContext();
  const isMobile = useMediaQuery(theme.breakpoints.down('lg'));
  const [mobileOpen, setMobileOpen] = React.useState(false);

  // Navigation items configuration
  const navItems = [
    { text: 'Home', icon: HomeIcon, path: '/home' },
    { text: 'Design', icon: DesignIcon, path: '/design' },
    { text: 'Genome', icon: GenomeIcon, path: '/genome' },
    { text: 'Task', icon: TaskIcon, path: '/task' },
    { text: 'Tutorial', icon: TutorialIcon, path: '/tutorial' },
    { text: 'Agent', icon: SmartToyIcon, path: '/agent' },
  ];

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const drawer = (
    <List sx={{ p: 2 }}>
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = location.pathname.startsWith(item.path);
        return (
          <ListItemButton
            key={item.text}
            onClick={() => {
              navigate(item.path);
              if (isMobile) handleDrawerToggle();
            }}
            selected={isActive}
            sx={{
              borderRadius: 1.5,
              mb: 0.75,
              py: 1.25,
              backgroundColor: isActive ? 'primary.main' : 'transparent',
              color: isActive ? 'primary.contrastText' : 'text.primary',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              '&:hover': {
                backgroundColor: isActive ? 'primary.dark' : alpha(theme.palette.primary.main, 0.08),
                transform: 'translateX(4px)',
              },
              '&.Mui-selected': {
                backgroundColor: 'primary.main',
                color: 'primary.contrastText',
                '&:hover': {
                  backgroundColor: 'primary.dark',
                },
              },
              '&:active': {
                transform: 'scale(0.98)',
              }
            }}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>
              <Icon 
                sx={{ 
                  color: isActive ? 'primary.contrastText' : 'primary.main',
                  fontSize: '1.2rem',
                  transition: 'all 0.2s'
                }} 
              />
            </ListItemIcon>
            <ListItemText 
              primary={item.text} 
              primaryTypographyProps={{
                fontWeight: isActive ? 600 : 500,
                fontSize: '0.9rem'
              }}
            />
          </ListItemButton>
        );
      })}
      <Divider sx={{ my: 1 }} />
      <Typography variant="overline" color="text.secondary" sx={{ px: 2, fontSize: 11 }}>Project links</Typography>
      {PROJECT_LINKS.map(link => {
        const Icon = link.icon;
        return <ListItemButton
          key={link.label}
          component="a"
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={link.label}
          onClick={() => setMobileOpen(false)}
          sx={{ borderRadius: 1.5, py: 1.25 }}
        >
          <ListItemIcon sx={{ minWidth: 36 }}><Icon sx={{ color: 'text.secondary', fontSize: '1.2rem' }} /></ListItemIcon>
          <ListItemText primary={link.label} primaryTypographyProps={{ fontWeight: 500, fontSize: '0.9rem' }} />
          <OpenInNewIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
        </ListItemButton>;
      })}
      <ListItemButton
        component="a"
        href={CONTACT_MAILTO}
        onClick={() => {
          if (isMobile) handleDrawerToggle();
        }}
        sx={{
          borderRadius: 1.5,
          py: 1.25,
          transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            backgroundColor: alpha(theme.palette.primary.main, 0.08),
            transform: 'translateX(4px)',
          },
        }}
      >
        <ListItemIcon sx={{ minWidth: 36 }}>
          <ContactMailIcon sx={{ color: 'primary.main', fontSize: '1.2rem' }} />
        </ListItemIcon>
        <ListItemText
          primary="Contact"
          primaryTypographyProps={{ fontWeight: 500, fontSize: '0.9rem' }}
        />
      </ListItemButton>
    </List>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar position="fixed" elevation={0}>
        <Toolbar sx={{ minHeight: { xs: 56, sm: 60 }, height: { xs: 56, sm: 60 }, py: 0 }}>
          {isMobile && (
            <IconButton
              color="inherit"
              aria-label="open drawer"
              edge="start"
              onClick={handleDrawerToggle}
              sx={{ 
                mr: { xs: 1, sm: 2 },
                '&:hover': {
                  backgroundColor: alpha(theme.palette.primary.main, 0.12),
                }
              }}
            >
              <MenuIcon />
            </IconButton>
          )}
          
          <Box sx={{ display: 'flex', alignItems: 'center', mr: { xs: 1, sm: 3 }, flexGrow: isMobile ? 1 : 0, flexShrink: 0 }}>
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                mr: { xs: 0.75, sm: 1.5 },
                boxShadow: `0 2px 8px ${alpha(theme.palette.primary.main, 0.15)}`,
                overflow: 'hidden',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'background.paper',
                border: '2px solid',
                borderColor: alpha(theme.palette.primary.main, 0.1),
              }}
            >
              <Box
                component="img"
                src="/uprobe_logo.svg" 
                alt="U-Probe Logo"
                sx={{
                  width: '75%',
                  height: '75%',
                  objectFit: 'contain',
                }}
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </Box>
            <Typography 
              variant="h6" 
              component="div" 
              sx={{ 
                flexGrow: 0,
                fontWeight: 700,
                color: 'text.primary',
                fontSize: { xs: '1.1rem', sm: '1.25rem' }
              }}
            >
              U-Probe
            </Typography>
          </Box>

          {!isMobile && (
            <Box sx={{ flexGrow: 1, display: 'flex', gap: 0.5, ml: 2 }}>
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname.startsWith(item.path);
                return (
                  <Button
                    key={item.text}
                    startIcon={<Icon sx={{ fontSize: '1rem', color: 'inherit', transition: 'all 0.2s' }} />}
                    onClick={() => navigate(item.path)}
                    sx={{
                      borderRadius: 1.5,
                      px: 2,
                      py: 0.5,
                      minHeight: 36,
                      fontWeight: isActive ? 600 : 500,
                      fontSize: '0.8125rem',
                      textTransform: 'none',
                      color: isActive ? 'primary.main' : 'text.secondary',
                      backgroundColor: isActive ? 'action.selected' : 'transparent',
                      position: 'relative',
                      transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                      '&::after': {
                        content: '""',
                        position: 'absolute',
                        bottom: 0,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: isActive ? '70%' : '0%',
                        height: '2px',
                        backgroundColor: 'primary.main',
                        borderRadius: '2px 2px 0 0',
                        transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      },
                      '&:hover': {
                        backgroundColor: 'action.hover',
                        color: 'primary.main',
                        '&::after': {
                          width: '70%',
                        }
                      },
                      '&:active': {
                        transform: 'scale(0.98)',
                      }
                    }}
                  >
                    {item.text}
                  </Button>
                );
              })}
            </Box>
          )}

          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0,
            '& > .MuiIconButton-root, & > nav .MuiIconButton-root, & > .MuiBox-root > .MuiIconButton-root': {
              width: 36, height: 36, p: 0,
            },
            '& > .MuiBox-root > .MuiIconButton-root .MuiAvatar-root': { width: 30, height: 30 },
          }}>
          {!isMobile && <Box component="nav" aria-label="Project links" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
            {PROJECT_LINKS.map(link => {
              const Icon = link.icon;
              return <Tooltip key={link.label} title={link.label}>
                <IconButton
                  component="a"
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={link.label}
                  size="small"
                  sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main', bgcolor: 'action.hover' } }}
                ><Icon sx={{ fontSize: '1.1rem' }} /></IconButton>
              </Tooltip>;
            })}
          </Box>}

          <Tooltip title="Contact">
            <IconButton
              component="a"
              href={CONTACT_MAILTO}
              size="small"
              aria-label="Contact"
              sx={{
                color: 'text.secondary',
                '&:hover': {
                  backgroundColor: 'action.hover',
                  color: 'primary.main',
                },
              }}
            >
              <ContactMailIcon sx={{ fontSize: '1.1rem' }} />
            </IconButton>
          </Tooltip>

          {/* Dark mode toggle */}
          <Tooltip title={mode === 'dark' ? 'Light Mode' : 'Dark Mode'}>
            <IconButton
              aria-label={mode === 'dark' ? 'Light Mode' : 'Dark Mode'}
              onClick={toggleTheme}
              size="small"
              sx={{
                color: 'text.secondary',
                '&:hover': {
                  backgroundColor: 'action.hover',
                  color: 'primary.main',
                }
              }}
            >
              {mode === 'dark' ? <LightModeIcon sx={{ fontSize: '1.1rem' }} /> : <DarkModeIcon sx={{ fontSize: '1.1rem' }} />}
            </IconButton>
          </Tooltip>

          <AccountMenu />
          </Box>
        </Toolbar>
      </AppBar>

      {isMobile && (
        <Drawer
          variant="temporary"
          anchor="left"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true,
          }}
          sx={{
            '& .MuiDrawer-paper': { 
              width: 280, 
              boxSizing: 'border-box',
              backgroundColor: 'background.paper',
              borderRadius: '0 16px 16px 0',
              border: 'none',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
            },
          }}
        >
          <Box sx={{ p: 3, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  mr: 2,
                  overflow: 'hidden',
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'background.paper',
                  border: `2px solid ${alpha(theme.palette.primary.main, 0.1)}`,
                  boxShadow: `0 2px 8px ${alpha(theme.palette.primary.main, 0.15)}`,
                }}
              >
                <Box
                  component="img"
                  src="/uprobe_logo.svg"
                  alt="U-Probe Logo"
                  sx={{
                    width: '75%',
                    height: '75%',
                    objectFit: 'contain',
                  }}
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.main' }}>
                U-Probe
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Probe Design Platform
            </Typography>
          </Box>
          {drawer}
        </Drawer>
      )}

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          pt: { xs: '56px', sm: '60px' },
        }}
      >
        <Routes>
          <Route path="/auth" element={<Auth />} />
          
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Layout><Outlet /></Layout>}>
              <Route index element={<Navigate to="/home" replace />} />
              <Route path="home" element={<Home />} />
              <Route path="design" element={<Design />}>
                <Route path="customprobe" element={<CustomProbe />} />
                <Route path="designworkflow" element={<DesignWorkflow />} />
              </Route>
              <Route path="tutorial" element={<Tutorial />} />
              <Route path="account/*" element={<AccountMenu />} />
              <Route path="account/profile" element={<Profile />} />
              <Route path="account/settings" element={<Settings />} />
              <Route path="account/logout" element={<Logout />} />
              <Route path="*" element={<NotFound />} />
            </Route>
            {/* Full-width pages */}
            <Route path="genome" element={<Layout fullWidth><Genome /></Layout>} />
            <Route path="task" element={<Layout fullWidth><Task /></Layout>} />
            {/* Agent page without Layout wrapper */}
            <Route path="agent" element={<Agent />} />
          </Route>
        </Routes>
      </Box>
    </Box>
  );
}

const MainApp = () => (
  <Router>
    <ThemeProvider>
      <CssBaseline />
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </Router>
);

export default MainApp;
