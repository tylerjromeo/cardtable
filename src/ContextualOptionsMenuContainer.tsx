import { connect } from "react-redux";
import {
  anyCardsSelectedWithPeerRef,
  cardsSelectedWithPeerRef,
  getMultiselectMode,
  getPanMode,
} from "./features/cards/cards.selectors";
import {
  exhaustCard,
  flipCards,
  togglePanMode,
  toggleMultiselectMode,
  toggleToken,
  adjustStatusToken,
  adjustCounterToken,
  deleteCardStack,
  addToPlayerHand,
  clearCardTokens,
  adjustModifier,
  toggleExtraIcon,
} from "./features/cards/cards.slice";
import {
  drawCardsOutOfCardStack,
  shuffleStack,
} from "./features/cards/cards.thunks";
import { getGame, getSnapCardsToGrid } from "./features/game/game.selectors";
import { RootState } from "./store/rootReducer";
import ContextualOptionsMenu from "./ContextualOptionsMenu";
import {
  setDrawingArrow,
  showRadialMenuAtPosition,
  toggleDrawCardsIntoHand,
  toggleSnapCardsToGrid,
} from "./features/game/game.slice";
import { myPeerRef } from "./constants/app-constants";
import { ActionCreators } from "redux-undo";
import { startNewArrow } from "./features/arrows/arrows.thunks";

const mapStateToProps = (state: RootState) => {
  const playerNumberToShow =
    getGame(state).currentVisiblePlayerHandNumber ??
    getGame(state).playerNumbers[myPeerRef];
  return {
    selectedCardStacks: cardsSelectedWithPeerRef(myPeerRef)(state),
    playerNumber: playerNumberToShow,
    anyCardsSelected: anyCardsSelectedWithPeerRef(myPeerRef)(state),
    currentGameType: getGame(state).activeGameType,
    panMode: getPanMode(state),
    multiselectMode: getMultiselectMode(state),
    drawCardsIntoHand: getGame(state).drawCardsIntoHand,
    snapCardsToGrid: getSnapCardsToGrid(state),
  };
};

const ContextualOptionsMenuContainer = connect(mapStateToProps, {
  togglePanMode,
  toggleMultiselectMode,
  toggleToken,
  adjustStatusToken,
  adjustCounterToken,
  showRadialMenuAtPosition,
  undo: ActionCreators.undo,
  redo: ActionCreators.redo,
  toggleDrawCardsIntoHand,
  toggleSnapCardsToGrid,
  //For sure using
  shuffleStack,
  clearCardTokens,
  flipCards,
  exhaustCard,
  deleteCardStack,
  addToPlayerHand,
  setDrawingArrow,
  startNewArrow,
  adjustModifier,
  toggleExtraIcon,
  drawCardsOutOfCardStack,
})(ContextualOptionsMenu);

export default ContextualOptionsMenuContainer;
