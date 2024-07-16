interface IHeaderUtil {
    scrollId: string;
    callback?: () => void;
};

export const handleSmoothScroll = ({
    scrollId,
    callback
}: IHeaderUtil) => {
    callback?.()
    const element = document.querySelector(`#${scrollId}`);
    if (element) {
        element?.scrollIntoView?.({
            behavior: 'smooth',
        })
    } else {
        console.warn(`Element with '${scrollId}' not found`);
    }
};