import React, { useState } from 'react';

const CarbonInput = ({ label, id, name, type = 'text', required = false, ...props }: any) => (
  <div className="flex flex-col mb-6 w-full">
    <label htmlFor={id || name} className="text-xs font-normal text-ibm-gray-60 mb-2">
      {label} {required && <span className="text-ibm-red">*</span>}
    </label>
    <input
      id={id || name}
      name={name}
      type={type}
      required={required}
      className="bg-ibm-gray-20 border-b border-ibm-gray-60 h-10 px-4 text-sm text-ibm-gray-100 placeholder-ibm-gray-60 focus:outline-none focus:border-ibm-red focus:ring-2 focus:ring-ibm-red focus:ring-offset-0 transition-shadow w-full"
      {...props}
    />
  </div>
);

const CarbonSelect = ({ label, id, name, options, required = false, ...props }: any) => (
  <div className="flex flex-col mb-6 w-full">
    <label htmlFor={id || name} className="text-xs font-normal text-ibm-gray-60 mb-2">
      {label} {required && <span className="text-ibm-red">*</span>}
    </label>
    <div className="relative">
      <select
        id={id || name}
        name={name}
        required={required}
        className="w-full bg-ibm-gray-20 border-b border-ibm-gray-60 h-10 px-4 text-sm text-ibm-gray-100 focus:outline-none focus:border-ibm-red focus:ring-2 focus:ring-ibm-red focus:ring-offset-0 transition-shadow appearance-none"
        {...props}
      >
        <option value="" disabled>
          Choose an option
        </option>
        {options.map((opt: string) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-ibm-gray-100">
        <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
          <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
        </svg>
      </div>
    </div>
  </div>
);

const CarbonCheckbox = ({ label, id, name, required = false, ...props }: any) => (
  <div className="flex items-start mb-6">
    <div className="flex items-center h-5">
      <input
        id={id || name}
        name={name}
        type="checkbox"
        required={required}
        className="w-4 h-4 border-ibm-gray-60 rounded-none text-ibm-red focus:ring-ibm-red focus:ring-2 focus:ring-offset-0 bg-ibm-gray-20"
        {...props}
      />
    </div>
    <div className="ml-3 text-sm">
      <label htmlFor={id || name} className="text-ibm-gray-100">
        {label} {required && <span className="text-ibm-red">*</span>}
      </label>
    </div>
  </div>
);

type AnyRec = Record<string, any>;

const emptyExperience = () => ({ institution_name: '', address: '', start_date: '', end_date: '' });
const emptyTertiary = () => ({ institution: '', address: '', course_name: '', duration: '', date_graduated: '', qualification: '' });
const emptyReferee = () => ({ referee_name: '', address: '', phone_number: '', place_of_work: '', position: '' });

const getQueryParam = (key: string): string | null => {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(key);
};

type LandingState = 'form' | 'submitted' | 'paid' | 'failed';

export default function App() {
  const initialLanding: LandingState = getQueryParam('paid')
    ? 'paid'
    : getQueryParam('failed')
    ? 'failed'
    : 'form';

  const [landing, setLanding] = useState<LandingState>(initialLanding);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedName, setSubmittedName] = useState<string>(() => getQueryParam('ref') || '');

  const [formData, setFormData] = useState<AnyRec>({
    applicant_name: '',
    sex: '',
    date_of_birth: '',
    place_of_birth: '',
    residence: '',
    nationality: '',
    mobile: '',
    email: '',
    emergency_contact_name: '',
    emergency_relationship: '',
    emergency_address: '',
    emergency_phone: '',
    emergency_email: '',
    media_house: '',
    employer_address: '',
    employer_tel: '',
    employer_email: '',
    publisher: '',
    employer_start_date: '',
    current_position: '',
    senior_school: '',
    senior_year_completed: '',
    senior_qualification: '',
    declaration_signature: '',
    declaration_date: '',
    agreed: false,
  });

  const [experience, setExperience] = useState<AnyRec[]>([emptyExperience(), emptyExperience(), emptyExperience()]);
  const [tertiary, setTertiary] = useState<AnyRec[]>([emptyTertiary(), emptyTertiary(), emptyTertiary()]);
  const [referees, setReferees] = useState<AnyRec[]>([emptyReferee(), emptyReferee(), emptyReferee()]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const updateRow = (
    rows: AnyRec[],
    setter: React.Dispatch<React.SetStateAction<AnyRec[]>>,
    index: number,
    field: string,
    value: string,
  ) => {
    const next = rows.map((r, i) => (i === index ? { ...r, [field]: value } : r));
    setter(next);
  };

  const nextStep = (e: React.FormEvent) => {
    e.preventDefault();
    setStep((s) => s + 1);
    window.scrollTo(0, 0);
  };

  const prevStep = () => {
    setStep((s) => s - 1);
    window.scrollTo(0, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    const payload = {
      ...formData,
      agreed: formData.agreed ? 1 : 0,
      experience: JSON.stringify(experience.filter((r) => r.institution_name || r.address)),
      tertiary_education: JSON.stringify(tertiary.filter((r) => r.institution || r.course_name)),
      referees: JSON.stringify(referees.filter((r) => r.referee_name)),
    };

    try {
      const body = new URLSearchParams();
      Object.entries(payload).forEach(([k, v]) => body.append(k, String(v ?? '')));

      const csrfToken = (window as any).frappe?.csrf_token || '';
      const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
      };
      if (csrfToken) headers['X-Frappe-CSRF-Token'] = csrfToken;

      const res = await fetch('/api/method/gpu.api.submit_application', {
        method: 'POST',
        headers,
        body: body.toString(),
        credentials: 'same-origin',
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const json = await res.json();
      const message = json?.message || {};
      setSubmittedName(message.name || '');

      if (message.payment_required && message.payment_url) {
        window.location.href = message.payment_url;
        return;
      }

      setLanding('submitted');
      window.scrollTo(0, 0);
    } catch (err: any) {
      setSubmitError(err?.message || 'Failed to submit application.');
    } finally {
      setSubmitting(false);
    }
  };

  const stepTitles = [
    'Personal Information',
    'Employer',
    'Experience',
    'Qualification',
    'Referees',
    'Declaration',
  ];

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <>
            <CarbonInput label="Name of applicant" name="applicant_name" required value={formData.applicant_name} onChange={handleChange} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
              <CarbonSelect label="Sex" name="sex" options={['Male', 'Female']} required value={formData.sex} onChange={handleChange} />
              <CarbonInput label="Date of birth" name="date_of_birth" type="date" required value={formData.date_of_birth} onChange={handleChange} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
              <CarbonInput label="Place of birth" name="place_of_birth" required value={formData.place_of_birth} onChange={handleChange} />
              <CarbonInput label="Residence" name="residence" required value={formData.residence} onChange={handleChange} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8">
              <CarbonInput label="Nationality" name="nationality" required value={formData.nationality} onChange={handleChange} />
              <CarbonInput label="Mobile #" name="mobile" type="tel" required value={formData.mobile} onChange={handleChange} />
              <CarbonInput label="Email" name="email" type="email" required value={formData.email} onChange={handleChange} />
            </div>

            <h3 className="text-lg font-medium text-ibm-gray-100 mt-6 mb-4 border-b border-ibm-gray-20 pb-2">Emergency Contact</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
              <CarbonInput label="Contact in case of emergency" name="emergency_contact_name" value={formData.emergency_contact_name} onChange={handleChange} />
              <CarbonInput label="Relationship with the contact" name="emergency_relationship" value={formData.emergency_relationship} onChange={handleChange} />
            </div>
            <CarbonInput label="Contact's address" name="emergency_address" value={formData.emergency_address} onChange={handleChange} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
              <CarbonInput label="Contact's phone number" name="emergency_phone" type="tel" value={formData.emergency_phone} onChange={handleChange} />
              <CarbonInput label="Contact's email" name="emergency_email" type="email" value={formData.emergency_email} onChange={handleChange} />
            </div>
          </>
        );
      case 2:
        return (
          <>
            <CarbonInput label="Name of media house" name="media_house" value={formData.media_house} onChange={handleChange} />
            <CarbonInput label="Address" name="employer_address" value={formData.employer_address} onChange={handleChange} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
              <CarbonInput label="Tel" name="employer_tel" type="tel" value={formData.employer_tel} onChange={handleChange} />
              <CarbonInput label="Email" name="employer_email" type="email" value={formData.employer_email} onChange={handleChange} />
            </div>
            <CarbonInput label="Publisher / Proprietor" name="publisher" value={formData.publisher} onChange={handleChange} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
              <CarbonInput label="When did you start work (month and year)" name="employer_start_date" placeholder="e.g. March 2022" value={formData.employer_start_date} onChange={handleChange} />
              <CarbonInput label="Current position" name="current_position" value={formData.current_position} onChange={handleChange} />
            </div>
          </>
        );
      case 3:
        return (
          <>
            <p className="text-sm text-ibm-gray-60 mb-6">
              Have you worked at any institution before? If yes, please list the three most recent ones.
            </p>
            {experience.map((row, i) => (
              <div key={i} className="mb-8 border-l-2 border-ibm-gray-20 pl-4">
                <h3 className="text-md font-medium text-ibm-gray-100 mb-4">Institution {i + 1}</h3>
                <CarbonInput label="Name of institution" name={`exp_name_${i}`} value={row.institution_name} onChange={(e: any) => updateRow(experience, setExperience, i, 'institution_name', e.target.value)} />
                <CarbonInput label="Address" name={`exp_addr_${i}`} value={row.address} onChange={(e: any) => updateRow(experience, setExperience, i, 'address', e.target.value)} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                  <CarbonInput label="Date you started there" type="date" name={`exp_start_${i}`} value={row.start_date} onChange={(e: any) => updateRow(experience, setExperience, i, 'start_date', e.target.value)} />
                  <CarbonInput label="Date you left" type="date" name={`exp_end_${i}`} value={row.end_date} onChange={(e: any) => updateRow(experience, setExperience, i, 'end_date', e.target.value)} />
                </div>
              </div>
            ))}
          </>
        );
      case 4:
        return (
          <>
            <h3 className="text-lg font-medium text-ibm-gray-100 mb-4 border-b border-ibm-gray-20 pb-2">i. Senior School</h3>
            <CarbonInput label="Name of senior school attended" name="senior_school" value={formData.senior_school} onChange={handleChange} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
              <CarbonInput label="Year completed" name="senior_year_completed" value={formData.senior_year_completed} onChange={handleChange} />
              <CarbonInput label="Qualification attained upon completion" name="senior_qualification" value={formData.senior_qualification} onChange={handleChange} />
            </div>

            <h3 className="text-lg font-medium text-ibm-gray-100 mt-8 mb-4 border-b border-ibm-gray-20 pb-2">ii. Tertiary Education</h3>
            {tertiary.map((row, i) => (
              <div key={i} className="mb-8 border-l-2 border-ibm-gray-20 pl-4">
                <h4 className="text-md font-medium text-ibm-gray-100 mb-4">Institution {i + 1}</h4>
                <CarbonInput label="Institution" name={`tert_inst_${i}`} value={row.institution} onChange={(e: any) => updateRow(tertiary, setTertiary, i, 'institution', e.target.value)} />
                <CarbonInput label="Address" name={`tert_addr_${i}`} value={row.address} onChange={(e: any) => updateRow(tertiary, setTertiary, i, 'address', e.target.value)} />
                <CarbonInput label="Course name" name={`tert_course_${i}`} value={row.course_name} onChange={(e: any) => updateRow(tertiary, setTertiary, i, 'course_name', e.target.value)} />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8">
                  <CarbonInput label="Duration" name={`tert_dur_${i}`} value={row.duration} onChange={(e: any) => updateRow(tertiary, setTertiary, i, 'duration', e.target.value)} />
                  <CarbonInput label="Date graduated" type="date" name={`tert_grad_${i}`} value={row.date_graduated} onChange={(e: any) => updateRow(tertiary, setTertiary, i, 'date_graduated', e.target.value)} />
                  <CarbonInput label="Qualification attained" name={`tert_qual_${i}`} value={row.qualification} onChange={(e: any) => updateRow(tertiary, setTertiary, i, 'qualification', e.target.value)} />
                </div>
              </div>
            ))}
          </>
        );
      case 5:
        return (
          <>
            <p className="text-sm text-ibm-gray-60 mb-6">
              Each applicant must submit the names of a minimum of two referees, at least one of whom must be a GPU member.
            </p>
            {referees.map((row, i) => (
              <div key={i} className="mb-8 border-l-2 border-ibm-gray-20 pl-4">
                <h3 className="text-md font-medium text-ibm-gray-100 mb-4">Referee {i + 1} {i < 2 ? '(Required)' : '(Optional)'}</h3>
                <CarbonInput label="Name of referee" name={`ref_name_${i}`} required={i < 2} value={row.referee_name} onChange={(e: any) => updateRow(referees, setReferees, i, 'referee_name', e.target.value)} />
                <CarbonInput label="Address" name={`ref_addr_${i}`} required={i < 2} value={row.address} onChange={(e: any) => updateRow(referees, setReferees, i, 'address', e.target.value)} />
                <CarbonInput label="Phone number" name={`ref_phone_${i}`} type="tel" required={i < 2} value={row.phone_number} onChange={(e: any) => updateRow(referees, setReferees, i, 'phone_number', e.target.value)} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                  <CarbonInput label="Place of work" name={`ref_work_${i}`} required={i < 2} value={row.place_of_work} onChange={(e: any) => updateRow(referees, setReferees, i, 'place_of_work', e.target.value)} />
                  <CarbonInput label="Position" name={`ref_pos_${i}`} required={i < 2} value={row.position} onChange={(e: any) => updateRow(referees, setReferees, i, 'position', e.target.value)} />
                </div>
              </div>
            ))}
          </>
        );
      case 6:
        return (
          <>
            <div className="bg-ibm-gray-20 p-6 mb-8 text-sm text-ibm-gray-80 leading-relaxed">
              I, <strong>{formData.applicant_name || '[Name]'}</strong>, hereby declare that the information given in this form are true and I am aware that any information found to be inaccurate can lead to the nullification of my membership. I promise to abide by the rules and regulations governing the union.
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
              <CarbonInput label="Signature (Type full name)" name="declaration_signature" required value={formData.declaration_signature} onChange={handleChange} />
              <CarbonInput label="Date" name="declaration_date" type="date" required value={formData.declaration_date} onChange={handleChange} />
            </div>

            <CarbonCheckbox
              label="I agree to the declaration above"
              name="agreed"
              required
              checked={formData.agreed || false}
              onChange={handleChange}
            />

            <div className="mt-8 p-4 border border-ibm-gray-20 text-sm text-ibm-gray-60">
              <strong>Note:</strong> Each completed application form must be accompanied by a non-refundable fee of D50 together with one passport size photo of the applicant.
            </div>

            {submitError && (
              <div className="mt-6 p-4 bg-[#fff1f1] border-l-4 border-ibm-red text-sm text-ibm-gray-100">
                {submitError}
              </div>
            )}
          </>
        );
      default:
        return null;
    }
  };

  if (landing !== 'form') {
    const isPaid = landing === 'paid';
    const isFailed = landing === 'failed';
    const tone = isPaid
      ? { bg: '#defbe6', border: '#24a148', title: 'Payment Received', body: `Thank you${submittedName ? `. Your application ${submittedName}` : ''}. Your application fee has been received and your application is now under review.` }
      : isFailed
      ? { bg: '#fff1f1', border: '#da1e28', title: 'Payment Failed', body: `We could not confirm your payment${submittedName ? ` for ${submittedName}` : ''}. Please try again or contact the GPU office.` }
      : { bg: '#defbe6', border: '#24a148', title: 'Application Submitted', body: `Thank you, ${formData.applicant_name}. Your application has been recorded${submittedName ? ` as ${submittedName}` : ''}.` };

    return (
      <div className="min-h-screen bg-ibm-gray-10 p-6 md:p-12 flex justify-center">
        <div className="w-full max-w-3xl bg-white p-8 md:p-12 shadow-sm">
          <div
            className="mb-8 p-4 border-l-4 text-[#161616] text-sm flex items-start"
            style={{ backgroundColor: tone.bg, borderLeftColor: tone.border }}
          >
            <div>
              <p className="font-semibold text-lg mb-1">{tone.title}</p>
              <p>{tone.body}</p>
              {!isPaid && !isFailed && (
                <p className="mt-2 text-xs text-ibm-gray-60">
                  Please deliver the non-refundable fee and one passport-size photo to the GPU office to complete your application.
                </p>
              )}
              {isFailed && (
                <button
                  onClick={() => { window.location.href = '/form'; }}
                  className="mt-4 px-4 py-2 text-xs font-normal text-white bg-ibm-red hover:bg-ibm-red-hover transition-colors"
                >
                  Start a new application
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ibm-gray-10 p-6 md:p-12 flex justify-center">
      <div className="w-full max-w-3xl bg-white p-8 md:p-12 shadow-sm">
        <div className="mb-8 border-l-4 border-ibm-red pl-4">
          <h1 className="text-3xl font-light text-ibm-gray-100 mb-2">Gambia Press Union — Membership Application</h1>
          <p className="text-sm text-ibm-gray-60">
            Please complete all required fields to submit your application.
          </p>
        </div>

        <div className="mb-10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-ibm-gray-100">Step {step} of 6</span>
            <span className="text-sm text-ibm-gray-60">{stepTitles[step - 1]}</span>
          </div>
          <div className="flex items-center w-full gap-1">
            {[1, 2, 3, 4, 5, 6].map((s) => (
              <div
                key={s}
                className={`h-1 flex-1 transition-colors ${step >= s ? 'bg-ibm-red' : 'bg-ibm-gray-20'}`}
              />
            ))}
          </div>
        </div>

        <form onSubmit={step === 6 ? handleSubmit : nextStep}>
          <div className="min-h-[400px]">{renderStepContent()}</div>

          <div className="mt-10 pt-6 border-t border-ibm-gray-20 flex justify-between items-center">
            {step > 1 ? (
              <button
                type="button"
                onClick={prevStep}
                disabled={submitting}
                className="px-6 py-3 text-sm font-normal text-ibm-gray-100 bg-ibm-gray-20 hover:bg-ibm-gray-60 hover:text-white transition-colors"
              >
                Previous
              </button>
            ) : (
              <div></div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-3 text-sm font-normal text-white bg-ibm-red hover:bg-ibm-red-hover transition-colors shadow-sm flex items-center disabled:opacity-60"
            >
              {step === 6 ? (submitting ? 'Submitting…' : 'Submit Application') : 'Next Step'}
              {step < 6 && (
                <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
