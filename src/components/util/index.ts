import ReactGA from 'react-ga';

interface IHeaderUtil {
    scrollId: string;
    callback?: () => void;
};

export const handleSmoothScroll = ({
    scrollId, callback
}: IHeaderUtil) => {
    callback?.();

    const element = document.querySelector(`#${scrollId}`);
    const headerHeight = document.querySelector('header')?.offsetHeight || 0;

    if (element) {
        const elementPosition = element.getBoundingClientRect().top + window.scrollY;

        window.scrollTo({
            top: elementPosition - headerHeight,
            behavior: 'smooth',
        });
    } else {
        console.warn(`Element with '${scrollId}' not found`);
    }
};

// export const initializeGA = () => {
//     ReactGA.initialize(process.env.REACTGA_KEY);
// };
