const CommentList: React.FC<{ comments: IComment[]; onDelete: (id: string) => void }> = ({ comments, onDelete }) => {
    return (
        <ul>
            {comments.map((comment) => (
                <li key={comment.id}>
                    <p>{comment.text}</p>
                    <small>{new Date(comment.timestamp).toLocaleString()}</small>
                    <button onClick={() => onDelete(comment.id)}>Delete</button>
                </li>
            ))}
        </ul>
    );
};

export default CommentList;
