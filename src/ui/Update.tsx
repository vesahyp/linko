import { useUpdateAvailable, reloadApp, newerVersionName, BUILD_NAME } from '../version';

/** A small banner when a newer build is on the server. */
export function UpdateBanner() {
  const has = useUpdateAvailable();
  if (!has) return null;
  return (
    <div className="update" data-ui>
      <span>
        New version: <b>{newerVersionName()}</b>
        <br />
        <small>You have {BUILD_NAME}</small>
      </span>
      <button className="btn primary" onClick={reloadApp}>
        Update
      </button>
    </div>
  );
}
