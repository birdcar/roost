import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';

const loadTodos = createServerFn({ method: 'GET' }).handler(async (): Promise<any> => {
  // In a real app: const user = await requireUser();
  // return Todo.where('user_id', user.id).all();
  return [
    { id: 1, title: 'Build the framework', completed: true, user_id: 'user_1' },
    { id: 2, title: 'Write example apps', completed: false, user_id: 'user_1' },
    { id: 3, title: 'Ship documentation', completed: false, user_id: 'user_1' },
  ];
});

export const Route = createFileRoute('/todos')({
  loader: () => loadTodos(),
  component: TodosPage,
});

function TodosPage() {
  const todos = Route.useLoaderData() as Array<{
    id: number;
    title: string;
    completed: boolean;
  }>;

  return (
    <div style={{ fontFamily: 'system-ui', padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <h1>My Todos</h1>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {todos.map((todo) => (
          <li key={todo.id} style={{ padding: '0.5rem 0', display: 'flex', gap: '0.5rem' }}>
            <input type="checkbox" checked={todo.completed} readOnly />
            <span style={{ textDecoration: todo.completed ? 'line-through' : 'none' }}>
              {todo.title}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
