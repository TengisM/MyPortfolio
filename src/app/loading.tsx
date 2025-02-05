export default function Loading() {
    return (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-cyan-400" />
        </div>
    );
};
