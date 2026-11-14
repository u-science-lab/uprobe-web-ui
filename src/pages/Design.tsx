import React from 'react';
import { 
  Card, CardActions, CardContent, CardMedia, Button, Typography, Box,
  useTheme, useMediaQuery, Paper, Chip, Grid, alpha
} from '@mui/material';
import { useNavigate, Outlet, useLocation } from 'react-router-dom';
import { 
  AutoAwesome, 
  Build, 
  Speed, 
  TrendingUp,
  PlayArrow,
  HelpOutline 
} from '@mui/icons-material';

// Define a React Functional Component using TypeScript
const Design: React.FC = () => {
  const navigate = useNavigate();  // Use useNavigate for navigation
  const location = useLocation();  // Add this to get current location
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Check if we're on a sub-route
  const isSubRoute = location.pathname !== '/design';

  const designOptions = [
    {
      title: 'Design Workflow',
      description: 'Use our intelligent workflow to complete the entire probe design process step by step',
      features: ['DNA/RNA support', 'Smart Parameter Optimization', 'Batch Processing'],
      image: '/4.jpeg',
      path: '/design/designworkflow',
      color: theme.palette.primary.main,
      icon: <AutoAwesome />,
      difficulty: 'Recommended',
      estimatedTime: '5-10 minutes'
    },
    {
      title: 'Custom Probe',
      description: 'Flexible probe structure design for experienced users with customizable probe attributes',
      features: ['DNA/RNA support', 'Custom probe structure', 'Custom probe attributes'],
      image: '/3.webp',
      path: '/design/customprobe',
      color: theme.palette.secondary.main,
      icon: <Build />,
      difficulty: 'Advanced',
      estimatedTime: '10-15 minutes'
    }
  ];

  return (
    <>
        {isSubRoute ? (
          <Outlet />
        ) : (
          <>
            {/* Header Section */}
            <Box sx={{ textAlign: 'center', mb: { xs: 4, sm: 6 } }}>
              <Typography 
                variant={isMobile ? "h3" : "h2"} 
                component="h1" 
                sx={{ 
                  mb: 2,
                  fontWeight: 800,
                  background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
                  backgroundClip: 'text',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Please start your probe design journey !
              </Typography>
              
              <Typography 
                variant="h6" 
                sx={{ 
                  color: 'text.secondary',
                  maxWidth: '600px',
                  mx: 'auto',
                  lineHeight: 1.6
                }}
              >
                Select the most suitable probe design method based on your needs and experience.
              </Typography>
            </Box>

            {/* Design Options */}
            <Grid container spacing={4} sx={{ mb: 6 }}>
              {designOptions.map((option, index) => (
                <Grid item xs={12} md={6} key={index}>
                  <Card
                    sx={{
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      position: 'relative',
                    background: theme.palette.mode === 'dark' 
                      ? `linear-gradient(135deg, ${alpha(option.color, 0.1)} 0%, ${theme.palette.background.paper} 100%)`
                      : `linear-gradient(135deg, ${alpha(option.color, 0.05)} 0%, ${theme.palette.background.paper} 100%)`,
                      border: `1px solid ${alpha(option.color, 0.1)}`,
                      '&:hover': {
                        '& .card-image': {
                          transform: 'scale(1.05)',
                        },
                        '& .icon-container': {
                          transform: 'rotate(5deg) scale(1.1)',
                        }
                      }
                    }}
                  >
                    {/* Header with Image */}
                    <Box sx={{ 
                      position: 'relative',
                      height: 200,
                      overflow: 'hidden',
                      borderRadius: '16px 16px 0 0'
                    }}>
                      <CardMedia
                        component="img"
                        image={option.image}
                        alt={option.title}
                        className="card-image"
                        sx={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          transition: 'transform 0.3s ease',
                        }}
                      />
                      
                      {/* Overlay with Icon */}
                      <Box
                        sx={{
                          position: 'absolute',
                          top: 16,
                          right: 16,
                          width: 48,
                          height: 48,
                          borderRadius: '50%',
                          backgroundColor: theme.palette.mode === 'dark' ? 'rgba(15, 23, 42, 0.75)' : 'rgba(255, 255, 255, 0.9)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'transform 0.3s ease',
                        }}
                        className="icon-container"
                      >
                        {React.cloneElement(option.icon, { 
                          sx: { fontSize: 24, color: option.color } 
                        })}
                      </Box>

                      {/* Difficulty Badge */}
                      <Box sx={{ position: 'absolute', top: 16, left: 16 }}>
                        <Chip
                          label={option.difficulty}
                          size="small"
                          sx={{
                            backgroundColor: option.color,
                            color: theme.palette.getContrastText(option.color),
                            fontWeight: 600,
                          }}
                        />
                      </Box>
                    </Box>

                    <CardContent sx={{ flexGrow: 1, p: 3 }}>
                      <Box sx={{ mb: 2 }}>
                        <Typography 
                          variant="h5" 
                          component="h3"
                          sx={{ 
                            fontWeight: 700,
                            color: option.color,
                            mb: 0.5
                          }}
                        >
                          {option.title}
                        </Typography>
                      </Box>

                      <Typography 
                        variant="body1" 
                        sx={{ 
                          color: 'text.secondary',
                          mb: 3,
                          lineHeight: 1.6
                        }}
                      >
                        {option.description}
                      </Typography>

                      {/* Features List */}
                      <Box sx={{ mb: 3 }}>
                        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                          Key Features:
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                          {option.features.map((feature, idx) => (
                            <Chip
                              key={idx}
                              label={feature}
                              size="small"
                              variant="outlined"
                              sx={{
                                borderColor: option.color,
                                color: option.color,
                                fontSize: '0.75rem'
                              }}
                            />
                          ))}
                        </Box>
                      </Box>

                      {/* Meta Info */}
                      <Box sx={{ 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        mb: 2
                      }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Speed sx={{ fontSize: 16, color: 'text.secondary' }} />
                          <Typography variant="caption" color="text.secondary">
                            {option.estimatedTime}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <TrendingUp sx={{ fontSize: 16, color: 'text.secondary' }} />
                          <Typography variant="caption" color="text.secondary">
                            {option.difficulty}
                          </Typography>
                        </Box>
                      </Box>
                    </CardContent>

                    <CardActions sx={{ p: 3, pt: 0, gap: 2 }}>
                      <Button 
                        onClick={() => navigate(option.path)} 
                        variant="contained"
                        fullWidth
                        size="large"
                        startIcon={<PlayArrow />}
                        sx={{
                          py: 1.5,
                          fontWeight: 600,
                          backgroundColor: option.color,
                          '&:hover': {
                            backgroundColor: option.color,
                            filter: 'brightness(0.9)',
                          }
                        }}
                      >
                        Get Started
                      </Button>
                      <Button 
                        onClick={() => navigate('/tutorial')} 
                        variant="outlined"
                        size="large"
                        startIcon={<HelpOutline />}
                        sx={{
                          borderColor: option.color,
                          color: option.color,
                          '&:hover': {
                            borderColor: option.color,
                            backgroundColor: `${option.color}08`,
                          }
                        }}
                      >
                        Learn More
                      </Button>
                    </CardActions>
                  </Card>
                </Grid>
              ))}
            </Grid>

            {/* Help Section */}
            <Paper
              sx={{
                p: 4,
                textAlign: 'center',
                background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.05)} 0%, ${alpha(theme.palette.secondary.main, 0.05)} 100%)`,
                border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`,
              }}
            >
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                Need Help Choosing?
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                If you don't need to customize probe structure, we recommend starting with "Design Workflow". If you have extensive probe design experience, choose "Custom Probe" for more control.
              </Typography>
              <Button
                variant="outlined"
                onClick={() => navigate('/tutorial')}
                sx={{ mr: 2 }}
              >
                View Tutorial
              </Button>
              <Button
                variant="contained"
                onClick={() => navigate('/design/designworkflow')}
              >
                Quick Start
              </Button>
            </Paper>
          </>
        )}
    </>
  );
};

export default Design;
