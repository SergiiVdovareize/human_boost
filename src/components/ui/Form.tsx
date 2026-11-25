import clsx from 'clsx'
import {
  type FormHTMLAttributes,
  forwardRef,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react'

export interface FormProps extends FormHTMLAttributes<HTMLFormElement> {
  children?: ReactNode
}

export function Form({ className, children, ...props }: FormProps) {
  return (
    <form className={clsx('ha-form', className)} {...props}>
      {children}
    </form>
  )
}

export interface FormGroupProps extends HTMLAttributes<HTMLDivElement> {
  controlId?: string
  children?: ReactNode
}

export function FormGroup({ className, controlId, children, ...props }: FormGroupProps) {
  return (
    <div id={controlId} className={clsx('ha-form-group form-group', className)} {...props}>
      {children}
    </div>
  )
}

export interface FormLabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  children?: ReactNode
}

export function FormLabel({ className, children, ...props }: FormLabelProps) {
  return (
    <label className={clsx('ha-form-label form-label', className)} {...props}>
      {children}
    </label>
  )
}

export interface FormControlProps extends InputHTMLAttributes<HTMLInputElement> {
  isInvalid?: boolean
  as?: 'input' | 'textarea'
}

export const FormControl = forwardRef<HTMLInputElement, FormControlProps>(
  ({ className, isInvalid = false, type = 'text', ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={clsx(
          'ha-form-control form-control',
          isInvalid && 'is-invalid ha-form-control--invalid',
          className
        )}
        {...props}
      />
    )
  }
)
FormControl.displayName = 'FormControl'

export interface FeedbackProps extends HTMLAttributes<HTMLDivElement> {
  type?: 'valid' | 'invalid'
  children?: ReactNode
}

export function Feedback({ type = 'valid', className, children, ...props }: FeedbackProps) {
  return (
    <div
      className={clsx(
        'ha-feedback',
        type === 'invalid'
          ? 'ha-feedback--invalid invalid-feedback'
          : 'ha-feedback--valid valid-feedback',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export interface FormSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  isInvalid?: boolean
  children?: ReactNode
}

export const FormSelect = forwardRef<HTMLSelectElement, FormSelectProps>(
  ({ className, isInvalid = false, children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={clsx(
          'ha-form-select form-select',
          isInvalid && 'is-invalid ha-form-select--invalid',
          className
        )}
        {...props}
      >
        {children}
      </select>
    )
  }
)
FormSelect.displayName = 'FormSelect'

export interface FormCheckProps extends InputHTMLAttributes<HTMLInputElement> {
  type?: 'checkbox' | 'radio' | 'switch'
  label?: ReactNode
}

export const FormCheck = forwardRef<HTMLInputElement, FormCheckProps>(
  (
    {
      type = 'checkbox',
      label,
      className,
      id,
      checked,
      defaultChecked,
      defaultValue,
      onChange,
      disabled,
      ...props
    },
    ref
  ) => {
    const isSwitch = type === 'switch'
    const inputType = isSwitch ? 'checkbox' : type

    // Handle string defaultValue like "true" or boolean
    const isDefaultChecked =
      defaultChecked ??
      (defaultValue === 'true' ? true : defaultValue === 'false' ? false : undefined)

    const isControlled = typeof checked === 'boolean'

    if (isSwitch) {
      return (
        <label className={clsx('ha-form-switch form-switch', disabled && 'ha-disabled', className)}>
          <input
            ref={ref}
            type="checkbox"
            role="switch"
            id={id}
            className="ha-form-switch-input form-check-input"
            {...props}
            {...(isControlled
              ? { checked, onChange }
              : { defaultChecked: isDefaultChecked, onChange })}
            disabled={disabled}
          />
          <span className="ha-form-switch-slider" />
          {label && <span className="ha-form-check-label form-check-label">{label}</span>}
        </label>
      )
    }

    return (
      <label className={clsx('ha-form-check form-check', disabled && 'ha-disabled', className)}>
        <input
          ref={ref}
          type={inputType}
          id={id}
          className="ha-form-check-input form-check-input"
          {...props}
          {...(isControlled
            ? { checked, onChange }
            : { defaultChecked: isDefaultChecked, onChange })}
          disabled={disabled}
        />
        {label && <span className="ha-form-check-label form-check-label">{label}</span>}
      </label>
    )
  }
)
FormCheck.displayName = 'FormCheck'

export interface FormTextProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode
}

export function FormText({ className, children, ...props }: FormTextProps) {
  return (
    <div className={clsx('ha-form-text form-text', className)} {...props}>
      {children}
    </div>
  )
}
// Subcomponents
;(FormControl as unknown as { Feedback: typeof Feedback }).Feedback = Feedback

Form.Group = FormGroup
Form.Label = FormLabel
Form.Control = FormControl as typeof FormControl & { Feedback: typeof Feedback }
Form.Feedback = Feedback
Form.Select = FormSelect
Form.Check = FormCheck
Form.Text = FormText

export default Form
