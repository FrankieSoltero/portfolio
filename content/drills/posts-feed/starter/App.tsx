import { useEffect, useState } from "react";
import { fetchComments, fetchPosts, fetchUsers, type Comment, type Post, type User } from "./api";

interface PostRowProps {
  post: Post;
  author: string | undefined;
  liked: boolean;
  open: boolean;
  loading: boolean;
  comments: Comment[];
  onLike: () => void;
  onShowComments: () => void;
}

function PostRow({ post, author, liked, open, loading, comments, onLike, onShowComments }: PostRowProps) {
  const [pinned, setPinned] = useState(false);

  return (
    <section aria-label={post.title} onClick={onShowComments}>
      <h2>{post.title}</h2>
      <p>{`Author: ${author ?? "…"}`}</p>
      <label>
        <input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} />
        {` Pin ${post.title}`}
      </label>{" "}
      <button type="button" onClick={onLike}>
        {`${liked ? "Unlike" : "Like"} ${post.title}`}
      </button>{" "}
      <button type="button">{`Show comments for ${post.title}`}</button>
      {open &&
        (loading ? (
          <p>Loading comments…</p>
        ) : (
          <ul>
            {comments.map((comment) => (
              <li key={comment.id}>{comment.body}</li>
            ))}
          </ul>
        ))}
    </section>
  );
}

export default function App() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [likedIds, setLikedIds] = useState<number[]>([]);
  const [selectedPostId, setSelectedPostId] = useState<number | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [threadsLoaded, setThreadsLoaded] = useState(0);
  const [newestFirst, setNewestFirst] = useState(false);

  useEffect(() => {
    fetchPosts().then(setPosts);
    fetchUsers().then(setUsers);
  }, []);

  function like(postId: number) {
    likedIds.push(postId);
    setLikedIds(likedIds);
  }

  function showComments(postId: number) {
    setSelectedPostId(postId);
    setLoadingComments(true);
    fetchComments(postId).then((data) => {
      setComments(data);
      setLoadingComments(false);
      setThreadsLoaded(threadsLoaded + 1);
    });
  }

  const shownPosts = newestFirst ? [...posts].reverse() : posts;

  return (
    <main>
      <p>{`Threads loaded: ${threadsLoaded}`}</p>
      <label>
        <input type="checkbox" checked={newestFirst} onChange={(event) => setNewestFirst(event.target.checked)} />
        {" Newest first"}
      </label>
      {shownPosts.map((post, index) => (
        <PostRow
          key={index}
          post={post}
          author={users.find((user) => user.id === post.userId)?.name}
          liked={likedIds.includes(post.id)}
          open={selectedPostId === post.id}
          loading={loadingComments}
          comments={comments}
          onLike={() => like(post.id)}
          onShowComments={() => showComments(post.id)}
        />
      ))}
    </main>
  );
}
