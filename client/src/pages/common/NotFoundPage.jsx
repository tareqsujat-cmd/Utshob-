import { EmptyState } from '../../components/ui/States.jsx';
import { ButtonLink } from '../../components/ui/Button.jsx';

export function NotFoundPage() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <EmptyState
        icon="mapPin"
        title="Page not found"
        message="The page you are looking for does not exist or has moved."
        action={<ButtonLink to="/">Go to overview</ButtonLink>}
      />
    </div>
  );
}
