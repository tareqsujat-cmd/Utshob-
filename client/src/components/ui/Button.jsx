import { Link } from 'react-router-dom';
import { Icon } from './Icon.jsx';
import { Spinner } from './States.jsx';

const BASE =
  'inline-flex items-center justify-center rounded-lg font-semibold transition-colors whitespace-nowrap ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

const VARIANTS = {
  primary: 'bg-primary text-white hover:bg-primary-dark',
  secondary: 'border border-line bg-card text-ink hover:border-primary hover:text-primary',
  ghost: 'text-muted hover:bg-primary-soft hover:text-primary',
  danger: 'bg-danger text-white hover:brightness-95',
  accent: 'bg-accent text-ink hover:brightness-95',
};

const SIZES = {
  sm: 'h-8 gap-1.5 px-3 text-sm',
  md: 'h-10 gap-2 px-4 text-sm',
  lg: 'h-12 gap-2 px-5 text-base',
};

export function buttonClasses(variant = 'primary', size = 'md', extra = '') {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${extra}`;
}

// <Button onClick={save} loading={saving} icon="check">Save</Button>
export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  type = 'button',
  className = '',
  disabled,
  children,
  ...props
}) {
  return (
    <button type={type} className={buttonClasses(variant, size, className)} disabled={disabled || loading} {...props}>
      {loading ? <Spinner size={16} /> : icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  );
}

// Same look as a button, but navigates: <ButtonLink to="/events/new" icon="plus">New event</ButtonLink>
export function ButtonLink({ to, variant = 'primary', size = 'md', icon, className = '', children }) {
  return (
    <Link to={to} className={buttonClasses(variant, size, className)}>
      {icon && <Icon name={icon} size={16} />}
      {children}
    </Link>
  );
}
