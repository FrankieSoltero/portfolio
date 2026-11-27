import { useState } from "react";
import { fetchComments, type Comment } from "./api";

const POSTS = [
  { id: 1, title: "Alpha" },
  { id: 2, title: "Beta" },
  { id: 3, title: "Gamma" },
];

export default function App() {
  const [selectedPostId, setSelectedPostId] = useState<number | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [threadsLoaded, setThreadsLoaded] = useState(0);

  function showComments(postId: number) {
    setSelectedPostId(postId);
    fetchComments(postId).then((data) => {
      setComments(data);
      setThreadsLoaded(threadsLoaded + 1);
    });
  }

  return (
    <main>
      <p>{`Threads loaded: ${threadsLoaded}`}</p>
      {POSTS.map((post) => (
        <section key={post.id} aria-label={post.title}>
          <h2>{post.title}</h2>
          <button type="button" onClick={() => showComments(post.id)}>
            {`Show comments for ${post.title}`}
          </button>
          {selectedPostId === post.id && (
            <ul>
              {comments.map((comment) => (
                <li key={comment.id}>{comment.body}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </main>
  );
}
