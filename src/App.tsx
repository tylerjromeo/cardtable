import { useEffect, useState } from "react";
import { GameType } from "./game-modules/GameModule";
import GameContainer from "./GameContainer";
import "./App.scss";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import mainLogo from "./images/card-table-transparent.png";
import * as serviceWorkerRegistration from "./serviceWorkerRegistration";
import { Button, IconButton, Snackbar } from "@mui/material";
import React from "react";
import CloseIcon from "@material-ui/icons/Close";
import { cacheCommonImages } from "./utilities/game-utils";
import mixpanel from "mixpanel-browser";
import { H } from "highlight.run";
import log from "loglevel";
import { useKonami } from "react-konami-code";
import DevSettings from "./DevSettings";

(window as any).log = log;

interface IProps {
  activeGameType: GameType | null;
  updateActiveGameType: (val: GameType) => void;
  clearQueryParams: () => void;
}

const App = (props: IProps) => {
  const [showReload, setShowReload] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(
    null
  );
  const [showDevSettings, setShowDevSettings] = useState(false);
  const [numImageClicks, setNumImageClicks] = useState(0);

  // Set up konami code handler to show / hide dev settings panel
  const toggleDevSetting = () => {
    if (!showDevSettings) {
      setNumImageClicks(0);
    }
    setShowDevSettings(!showDevSettings);
  };

  useKonami(toggleDevSetting);

  const onSWUpdate = (registration: ServiceWorkerRegistration) => {
    setShowReload(true);
    setWaitingWorker(registration.waiting);
  };

  const clearQueryParams = props.clearQueryParams;
  useEffect(() => {
    clearQueryParams();
  }, [clearQueryParams]);

  useEffect(() => {
    //Default Log Level. Can override in the console with
    if (process.env.NODE_ENV !== "production") {
      log.setDefaultLevel("info");
    } else {
      log.setDefaultLevel("warn");
    }

    // Mixpanel
    mixpanel.init("c33a3e2ef8f81f3f8b1d8c4984e72760");
    mixpanel.track("Cardtable loaded");

    // highlight.io
    if (process.env.NODE_ENV === "production") {
      H.init("zg03k0g9", {
        version: "_REPLACE_VERSION_",
        enableCanvasRecording: true,
        samplingStrategy: {
          canvas: 15,
          canvasQuality: "low",
          canvasMaxSnapshotDimension: 480,
        },
        tracingOrigins: true,
        networkRecording: {
          enabled: true,
          recordHeadersAndBody: true,
          urlBlocklist: [
            // insert urls you don't want to record here
          ],
        },
      });
    }

    // Service Worker
    serviceWorkerRegistration.register({ onUpdate: onSWUpdate });
  }, []);

  const reloadPage = () => {
    waitingWorker?.postMessage({ type: "SKIP_WAITING" });
    setShowReload(false);
    window.location.reload();
  };

  const handleClose = (
    event: React.SyntheticEvent | Event,
    reason?: string
  ) => {
    if (reason === "clickaway") {
      return;
    }
  };

  const action = (
    <React.Fragment>
      <Button color="inherit" size="small" onClick={reloadPage}>
        Reload
      </Button>
      <IconButton
        size="small"
        aria-label="close"
        color="inherit"
        onClick={handleClose}
      >
        <CloseIcon fontSize="small" />
      </IconButton>
    </React.Fragment>
  );

  return (
    <div>
      {showDevSettings && (
        <DevSettings
          onClose={() => {
            setShowDevSettings(false);
          }}
        ></DevSettings>
      )}
      {!!props.activeGameType ? (
        <div>
          <Snackbar
            open={showReload}
            onClose={handleClose}
            anchorOrigin={{ vertical: "top", horizontal: "center" }}
            message="New version available"
            action={action}
          />
          <GameContainer currentGameType={props.activeGameType}></GameContainer>
        </div>
      ) : (
        <div>
          {renderGamePicker(
            props,
            toggleDevSetting,
            numImageClicks,
            setNumImageClicks
          )}
        </div>
      )}
    </div>
  );
};

const camelCaseToSpaces = (str: string) => {
  // insert a space before all caps
  return (
    str
      .replace(/([A-Z])/g, " $1")
      // uppercase the first character
      .replace(/^./, (s) => {
        return s.toUpperCase();
      })
  );
};

const renderGamePicker = (
  props: IProps,
  toggleDevSetting: () => void,
  numImageClicks: number,
  setNumImageClicks: (n: number) => void
) => {
  return (
    <div className="game-picker">
      <img
        onClick={() => {
          if (numImageClicks >= 9) {
            toggleDevSetting();
            setNumImageClicks(0);
          } else {
            setNumImageClicks(numImageClicks + 1);
          }
        }}
        className="logo"
        alt="cardtable"
        src={mainLogo}
      ></img>
      <FormControl className="select">
        <InputLabel id="game-picker-label">Select Game</InputLabel>
        <Select
          id="game-picker"
          labelId="game-picker-label"
          onChange={(e) => {
            props.updateActiveGameType(e.target.value as GameType);

            // Cache the common images
            cacheCommonImages(e.target.value as GameType);
          }}
          variant={"standard"}
        >
          {Object.entries(GameType).map(([key, value]) => {
            const label = camelCaseToSpaces(key);
            return (
              <MenuItem key={`menu-item-${key}`} value={value}>
                {label}
              </MenuItem>
            );
          })}
        </Select>
      </FormControl>
    </div>
  );
};

export default App;
