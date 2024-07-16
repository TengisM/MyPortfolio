import ReactGA from 'react-ga';

const initializeGA = () => {
  ReactGA.initialize('YOUR_GA_TRACKING_ID');
};

export default initializeGA;
