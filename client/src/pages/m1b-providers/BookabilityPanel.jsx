import { Link } from 'react-router-dom';
import { Alert } from '../../components/ui/Layout.jsx';

// Shows whether a provider may accept bookings, and if not, exactly why
// (the reasons come from the server's evaluateBookability rule).
export function BookabilityPanel({ bookability, own = false }) {
  if (!bookability) return null;

  if (bookability.bookable) {
    return (
      <Alert tone="success" title={own ? 'You can accept quotes and bookings' : 'Accepting bookings'}>
        Account approved and required documents reviewed by an administrator.
      </Alert>
    );
  }

  return (
    <Alert tone="warning" title={own ? 'You cannot accept bookings yet' : 'Not accepting bookings right now'}>
      <ul className="mt-1 list-disc pl-5">
        {bookability.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      {own && (
        <Link to="/provider/credentials" className="mt-2 inline-block font-semibold text-primary hover:underline">
          Go to credentials →
        </Link>
      )}
    </Alert>
  );
}
