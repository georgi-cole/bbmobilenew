/**
 * App.tsx — root component.
 *
 * Wraps the entire app in:
 *   <Provider store>  – Redux store provider
 *   <RouterProvider>  – React Router v6 browser router
 *
 * To add global providers (auth, theme, etc.) wrap them here.
 */
import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router-dom';
import { store } from './store/store';
import { router } from './routes';

export default function App() {
  return (
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>
  );
}
