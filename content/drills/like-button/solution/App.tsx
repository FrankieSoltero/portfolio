import { useState } from "react";

interface Post {
  id: number;
  title: string;
}

const POSTS: Post[] = [
  { id: 1, title: "First post" },
  { id: 2, title: "Second post" },
  { id: 3, title: "Third post" },
];

export default function App() {
  const [likedIds, setLikedIds] = useState<number[]>([]);

  function toggleLike(postId: number) {
    if (likedIds.includes(postId)) {
      setLikedIds(likedIds.filter((id) => id !== postId));
    } else {
      setLikedIds([...likedIds, postId]);
    }
  }

  return (
    <main>
      <ul>
        {POSTS.map((post) => {
          const liked = likedIds.includes(post.id);
          return (
            <li key={post.id}>
              {post.title}{" "}
              <button
                type="button"
                aria-label={`${liked ? "Unlike" : "Like"} ${post.title}`}
                onClick={() => toggleLike(post.id)}
              >
                {liked ? "Unlike" : "Like"}
              </button>
            </li>
          );
        })}
      </ul>
      <p>{`Liked: ${likedIds.length}`}</p>
    </main>
  );
}
