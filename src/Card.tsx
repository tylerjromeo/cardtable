// tslint:disable:no-console
import { KonvaEventObject } from "konva/lib/Node";
import { Rect as RectRef } from "konva/lib/shapes/Rect";
import { Vector2d } from "konva/lib/types";
import { Component } from "react";
import { Group, Rect, Text } from "react-konva";
import { animated, Spring } from "@react-spring/konva";
import CardTokensContainer from "./CardTokensContainer";
import { myPeerRef, PlayerColor } from "./constants/app-constants";
import {
  cardConstants,
  HORIZONTAL_TYPE_CODES,
} from "./constants/card-constants";
import { GamePropertiesMap } from "./constants/game-type-properties-mapping";
import CardModifiersContainer from "./CardModifiersContainer";
import { shouldRenderImageHorizontal } from "./utilities/card-utils";
import { debounce } from "lodash";
import { GameType } from "./game-modules/GameModule";

// There is a bug somewhere in react-konva or react-spring/konva, where, if you use the generic
// `animated` WithAnimations type, you get the following typescript error in typescript ~4.5:
//
// Type instantiation is excessively deep and possibly infinite
//
// We are explicitly casting to an any for now just until this bug is (hopefully) fixed
const AnimatedAny = animated as any;

export interface CardTokens {
  damage: number;
  threat: number;
  generic: number;
}

export interface CardUIState {
  stunned: number;
  confused: number;
  tough: number;
  tokens: CardTokens;
}

interface IProps {
  currentGameType: GameType;
  name: string;
  code: string;
  selectedColor: PlayerColor;
  controlledBy: string;
  dragging: boolean;
  shuffling: boolean;
  exhausted: boolean;
  cardState?: CardUIState;
  fill: string;
  disableDragging?: boolean;
  handleClick?: (
    id: string,
    event: KonvaEventObject<MouseEvent> | KonvaEventObject<TouchEvent>,
    wasTouch: boolean
  ) => void;
  handleDoubleClick?: (id: string, event: KonvaEventObject<MouseEvent>) => void;
  handleDoubleTap?: (id: string, event: KonvaEventObject<TouchEvent>) => void;
  handleDragStart?: (id: string, event: KonvaEventObject<DragEvent>) => void;
  handleDragMove?: (info: { id: string; dx: number; dy: number }) => void;
  handleDragEnd?: (id: string, event: KonvaEventObject<DragEvent>) => void;
  handleHover?: (id: string) => void;
  handleHoverLeave?: (id: string) => void;
  handleMouseDownWhenNotDraggable?: (id: string) => void;
  handleMouseUpWhenNotDraggable?: (id: string) => void;
  id: string;
  selected: boolean;
  dropTargetColor?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  imgUrls: string[];
  isGhost?: boolean;
  isPreview?: boolean;
  numCardsInStack?: number;
  typeCode?: string;
  faceup: boolean;
  handleContextMenu?: (
    id: string,
    event: KonvaEventObject<PointerEvent>
  ) => void;
}

interface IState {
  showDragHandle: boolean;
  imageLoaded: boolean;
  imageLoadFailed: number;
  prevImgUrls: string[];
  tokenImagesLoaded: {
    stunned: boolean;
    confused: boolean;
    tough: boolean;
  };
}

const stringArraysEqual = (array1: string[], array2: string[]) => {
  return (
    array1.length === array2.length &&
    array1.every((value, index) => {
      return value === array2[index];
    })
  );
};

class Card extends Component<IProps, IState> {
  // tslint:disable-next-line:member-access
  static getDerivedStateFromProps(props: IProps, state: IState): IState | null {
    if (!stringArraysEqual(props.imgUrls, state.prevImgUrls ?? [])) {
      return {
        showDragHandle: true,
        imageLoaded: false,
        imageLoadFailed: 0,
        prevImgUrls: props.imgUrls,
        tokenImagesLoaded: {
          stunned: state.tokenImagesLoaded.stunned,
          confused: state.tokenImagesLoaded.confused,
          tough: state.tokenImagesLoaded.tough,
        },
      };
    }
    // No state update necessary
    return null;
  }

  private imgs: HTMLImageElement[] = [];
  private stunnedImg: HTMLImageElement;
  private confusedImg: HTMLImageElement;
  private toughImg: HTMLImageElement;
  private unmounted: boolean;
  private touchTimer: any = null;
  private rect: RectRef | null = null;
  private shuffleToggle = false;

  constructor(props: IProps) {
    super(props);

    this.unmounted = true;

    this.state = {
      showDragHandle: true,
      imageLoaded: false,
      imageLoadFailed: 0,
      prevImgUrls: this.props.imgUrls,
      tokenImagesLoaded: {
        stunned: false,
        confused: false,
        tough: false,
      },
    };

    this.initCardImages(props);

    this.stunnedImg = new Image();
    this.confusedImg = new Image();
    this.toughImg = new Image();

    // STUNNED
    this.stunnedImg.onload = () => {
      if (!this.unmounted) {
        this.setState({
          tokenImagesLoaded: {
            stunned: true,
            confused: this.state.tokenImagesLoaded.confused,
            tough: this.state.tokenImagesLoaded.tough,
          },
        });
      }
    };

    const tokenInfo = GamePropertiesMap[props.currentGameType].tokens;

    if (!!props.cardState?.stunned && !!tokenInfo.stunned) {
      this.stunnedImg.src = tokenInfo.stunned.imagePath;
    }

    // CONFUSED
    this.confusedImg.onload = () => {
      if (!this.unmounted) {
        this.setState({
          tokenImagesLoaded: {
            stunned: this.state.tokenImagesLoaded.stunned,
            confused: true,
            tough: this.state.tokenImagesLoaded.tough,
          },
        });
      }
    };

    if (!!props.cardState?.confused && !!tokenInfo.confused) {
      this.confusedImg.src = tokenInfo.confused.imagePath;
    }

    // TOUGH
    this.toughImg.onload = () => {
      if (!this.unmounted) {
        this.setState({
          tokenImagesLoaded: {
            stunned: this.state.tokenImagesLoaded.stunned,
            confused: this.state.tokenImagesLoaded.confused,
            tough: true,
          },
        });
      }
    };

    if (!!props.cardState?.tough && !!tokenInfo.tough) {
      this.toughImg.src = tokenInfo.tough.imagePath;
    }
  }

  public componentDidUpdate(prevProps: IProps, prevState: IState) {
    // If we changed exhausted => unexhausted or vice versa, hide
    // the drag handle, becuase there's not a great way to
    // animate between the two positions
    if (
      this.state.showDragHandle &&
      prevProps.exhausted !== this.props.exhausted
    ) {
      this.setState({ showDragHandle: false });
    }

    // if we just went from not shuffling -> shuffling, animate
    if (!prevProps.shuffling && this.props.shuffling) {
      if (!!this.rect) {
        this.shuffleToggle = !this.shuffleToggle;
        this.rect.to({
          rotation: this.currentRotation + (this.shuffleToggle ? 360 : -360),
          duration: 0.2,
        });
      }
    }

    if (
      !this.state.imageLoaded &&
      !stringArraysEqual(prevProps.imgUrls, this.props.imgUrls)
    ) {
      this.setState({
        imageLoaded: false,
        imageLoadFailed: 0,
      });
      this.initCardImages(this.props);
    }

    const tokenInfo = GamePropertiesMap[this.props.currentGameType].tokens;

    // STUNNED
    if (
      !this.state.tokenImagesLoaded.stunned &&
      !prevProps.cardState?.stunned &&
      !!this.props.cardState?.stunned &&
      !!tokenInfo.stunned
    ) {
      this.stunnedImg.src = tokenInfo.stunned.imagePath;
    }

    // CONFUSED
    if (
      !this.state.tokenImagesLoaded.confused &&
      !prevProps.cardState?.confused &&
      !!this.props.cardState?.confused &&
      !!tokenInfo.confused
    ) {
      this.confusedImg.src = tokenInfo.confused.imagePath;
    }

    // TOUGH
    if (
      !this.state.tokenImagesLoaded.tough &&
      !prevProps.cardState?.tough &&
      !!this.props.cardState?.tough &&
      !!tokenInfo.tough
    ) {
      this.toughImg.src = tokenInfo.tough.imagePath;
    }
  }

  private initCardImages = (props: IProps) => {
    this.imgs = props.imgUrls.map(() => new Image());

    // When the image loads, set a flag in the state
    this.imgs.forEach(
      (img) =>
        (img.onload = () => {
          if (!this.unmounted) {
            this.setState({
              imageLoaded: true,
            });
          }
        })
    );

    this.imgs.forEach(
      (img) =>
        (img.onerror = () => {
          if (!this.unmounted) {
            this.setState({
              imageLoadFailed: this.state.imageLoadFailed + 1,
            });
          }
        })
    );

    props.imgUrls.forEach((imgUrl, index) => (this.imgs[index].src = imgUrl));
  };

  public componentDidMount() {
    this.unmounted = false;
  }

  public componentWillUnmount() {
    this.unmounted = true;
  }

  public render() {
    return this.renderCard(this.state.imageLoaded);
  }

  private renderCard(imageLoaded: boolean) {
    const heightToUse = this.props.height || cardConstants.CARD_HEIGHT;
    const widthToUse = this.props.width || cardConstants.CARD_WIDTH;

    return this.renderUnanimatedCard(heightToUse, widthToUse, imageLoaded);
  }

  // Unfortunately, if you try to use shadow / blur to indicate selection
  // (which I did at first and looks better, imo) the performance in horrible,
  // even with some reccommended settings (shadowForStrokeEnabled = false and
  // hitStrokeWidth = 0). So we'll just use stroke / border for everything
  private getStrokeColor = () => {
    if (!!this.props.dropTargetColor) {
      return this.props.dropTargetColor;
    }

    if (this.props.selected) {
      return this.props.selectedColor;
    }

    return "";
  };

  private renderUnanimatedCard = (
    heightToUse: number,
    widthToUse: number,
    imageLoaded: boolean
  ) => {
    const imgToUse = imageLoaded
      ? this.imgs.find((i) => i.complete && i.naturalHeight !== 0)
      : undefined;

    const scale = this.getScale(imgToUse, widthToUse, heightToUse);
    const offset = {
      x: widthToUse / 2,
      y: heightToUse / 2,
    };

    const card = (
      <Spring
        key={`${this.props.id}-card`}
        to={{
          rotation: this.props.exhausted ? 90 : 0,
        }}
        onRest={() => {
          this.setState({ showDragHandle: true });
        }}
      >
        {(animatedProps: any) => (
          <AnimatedAny.Rect
            {...animatedProps}
            ref={(node: any) => {
              if (!!node) {
                this.rect = node;
              }
            }}
            cornerRadius={9}
            width={widthToUse}
            height={heightToUse}
            offset={offset}
            stroke={this.getStrokeColor()}
            strokeWidth={!!this.getStrokeColor() ? 4 : 0}
            fillPatternRotation={
              !imageLoaded ||
              shouldRenderImageHorizontal(
                this.props.code,
                this.props.typeCode || "",
                HORIZONTAL_TYPE_CODES,
                this.plainCardBack
              )
                ? 270
                : 0
            }
            fillPatternImage={imgToUse}
            fillPatternScaleX={scale.width}
            fillPatternScaleY={scale.height}
            fill={imageLoaded ? undefined : "gray"}
            shadowForStrokeEnabled={false}
            hitStrokeWidth={0}
            opacity={this.props.isGhost ? 0.5 : 1}
          />
        )}
      </Spring>
    );

    const countDim = 40;

    const stackCountMainOffset = {
      x: 0,
      y: heightToUse / 2,
    };

    const stackCountoffset = {
      x: 20,
      y: 20,
    };

    // const card

    const cardStackCount =
      (this.props.numCardsInStack || 1) > 1 && !this.props.isGhost ? (
        <Spring
          key={`${this.props.id}-cardStackCount`}
          to={{
            rotation: this.props.exhausted ? 90 : 0,
            textRotation: this.props.exhausted ? -90 : 0,
          }}
        >
          {(animatedProps: any) => (
            <AnimatedAny.Group
              width={countDim}
              height={countDim}
              offset={stackCountMainOffset}
              {...animatedProps}
            >
              <AnimatedAny.Group width={countDim} height={countDim}>
                <AnimatedAny.Rect
                  offset={stackCountoffset}
                  cornerRadius={[9, 9, 9, 9]}
                  opacity={0.6}
                  fill={"black"}
                  shadowForStrokeEnabled={false}
                  hitStrokeWidth={0}
                  width={countDim}
                  height={countDim}
                />
                <AnimatedAny.Text
                  rotation={animatedProps.textRotation}
                  offset={stackCountoffset}
                  key={`${this.props.id}-cardstackcounttext`}
                  width={countDim}
                  height={countDim}
                  verticalAlign={"middle"}
                  align={"center"}
                  fontSize={(this.props.numCardsInStack || 1) > 99 ? 18 : 24}
                  fill={"white"}
                  text={`${this.props.numCardsInStack}`}
                />
              </AnimatedAny.Group>
            </AnimatedAny.Group>
          )}
        </Spring>
      ) : null;

    const dragHandleSize = 40;
    const dragHandleMainOffset = {
      x: this.props.exhausted
        ? widthToUse / 2 - dragHandleSize / 2
        : -widthToUse / 2 + dragHandleSize / 2,
      y: heightToUse / 2 - dragHandleSize / 2,
    };

    const dragHandleOffset = {
      x: dragHandleSize / 2,
      y: dragHandleSize / 2,
    };

    const cardStackDragHandle =
      (this.props.numCardsInStack || 1) > 1 &&
      !this.props.isGhost &&
      this.state.showDragHandle ? (
        <Group
          width={dragHandleSize}
          height={dragHandleSize}
          offset={dragHandleMainOffset}
          rotation={this.props.exhausted ? 90 : 0}
          onMouseEnter={() => {
            window.document.body.style.cursor = "ne-resize";
          }}
          onMouseLeave={() => {
            window.document.body.style.cursor = "default";
          }}
        >
          <Group width={dragHandleSize} height={dragHandleSize}>
            <Rect
              offset={dragHandleOffset}
              cornerRadius={[9, 9, 9, 9]}
              opacity={0.6}
              fill={"black"}
              shadowForStrokeEnabled={false}
              hitStrokeWidth={0}
              width={dragHandleSize}
              height={dragHandleSize}
            />
            <Text
              rotation={this.props.exhausted ? -90 : 0}
              offset={dragHandleOffset}
              key={`${this.props.id}-cardstackdraghandleicon`}
              width={dragHandleSize}
              height={dragHandleSize}
              verticalAlign={"middle"}
              align={"center"}
              fontSize={(this.props.numCardsInStack || 1) > 99 ? 18 : 24}
              fontFamily={'"Font Awesome 6 Free"'}
              fill={"white"}
              text={`\uf14d`}
            />
          </Group>
        </Group>
      ) : null;

    const cardStackOffset = {
      x: offset.x + 6,
      y: offset.y - 6,
    };

    const cardStack =
      (this.props.numCardsInStack || 1) > 1 ? (
        <Spring
          key={`${this.props.id}-cardStack`}
          to={{
            rotation: this.props.exhausted ? 90 : 0,
          }}
        >
          {(animatedProps: any) => (
            <AnimatedAny.Rect
              {...animatedProps}
              cornerRadius={[9, 9, 9, 9]}
              width={widthToUse}
              height={heightToUse}
              offset={cardStackOffset}
              opacity={this.props.isGhost ? 0.5 : 1}
              fill={"gray"}
              shadowForStrokeEnabled={false}
              hitStrokeWidth={0}
            />
          )}
        </Spring>
      ) : null;

    const shouldRenderStunned =
      !!this.props.cardState?.stunned && this.state.tokenImagesLoaded.stunned;

    const stunnedToken = this.getTokenInSlot(
      shouldRenderStunned,
      this.props.cardState?.stunned || 0,
      this.stunnedImg,
      offset,
      0
    );
    const confusedToken = this.getTokenInSlot(
      !!this.props.cardState?.confused && this.state.tokenImagesLoaded.confused,
      this.props.cardState?.confused || 0,
      this.confusedImg,
      offset,
      1
    );
    const toughToken = this.getTokenInSlot(
      !!this.props.cardState?.tough && this.state.tokenImagesLoaded.tough,
      this.props.cardState?.tough || 0,
      this.toughImg,
      offset,
      2
    );

    const cardTokens =
      this.props.dragging || this.props.isGhost ? null : (
        <CardTokensContainer
          currentGameType={this.props.currentGameType}
          key={`${this.props.id}-cardTokens`}
          id={this.props.id}
          x={0}
          y={0}
        ></CardTokensContainer>
      );

    const cardModifiers =
      this.props.dragging || this.props.isGhost ? null : (
        <CardModifiersContainer
          currentGameType={this.props.currentGameType}
          key={`${this.props.id}-cardModifiers`}
          id={this.props.id}
          x={0}
          y={0}
          cardHeight={this.props.height}
          cardWidth={this.props.width}
          isPreview={!!this.props.isPreview}
        ></CardModifiersContainer>
      );

    const noImageCardNameText = this.renderCardName(
      offset,
      widthToUse,
      heightToUse
    );

    return (
      <Group
        draggable={
          (this.props.controlledBy === "" ||
            this.props.controlledBy === myPeerRef) &&
          !this.props.disableDragging
        }
        onDragStart={this.handleDragStart}
        onDragMove={this.handleDragMove}
        onDragEnd={this.handleDragEnd}
        onDblClick={this.handleDoubleClick}
        onDblTap={this.handleDoubleTap}
        onClick={this.handleClick}
        onTap={this.handleTap}
        onMouseDown={this.handleMouseDown}
        onMouseUp={this.handleMouseUp}
        onTouchStart={this.handleTouchStart}
        onTouchMove={this.handleTouchMove}
        onTouchEnd={this.handleTouchEnd}
        onMouseOver={this.handleMouseOver}
        onMouseOut={this.handleMouseOut}
        onContextMenu={this.handleContextMenu}
        x={this.props.x}
        y={this.props.y}
      >
        {cardStack}
        {card}
        {cardStackCount}
        {cardStackDragHandle}
        {noImageCardNameText}
        {stunnedToken}
        {confusedToken}
        {toughToken}
        {cardTokens}
        {cardModifiers}
      </Group>
    );
  };

  private renderCardName(
    offset: Vector2d,
    cardWidth: number,
    cardHeight: number
  ) {
    const textOffset = { x: offset.x - 10, y: offset.y - 20 };
    const textItem =
      this.state.imageLoadFailed === this.props.imgUrls.length &&
      this.state.imageLoadFailed !== 0 ? (
        <Text
          key={`${this.props.id}-cardnametext`}
          offset={textOffset}
          width={cardWidth - 10}
          height={cardHeight - 20}
          fontSize={24}
          text={`${this.props.name} ${this.props.code}`}
        ></Text>
      ) : null;

    return textItem;
  }

  private getTokenInSlot(
    shouldRender: boolean,
    numberToRender: number,
    img: HTMLImageElement,
    offset: { x: number; y: number },
    slot: 0 | 1 | 2
  ) {
    const dimensions = {
      width: img.naturalWidth / 2,
      height: img.naturalHeight / 2,
    };

    const stunnedOffset = {
      x: offset.x - cardConstants.CARD_WIDTH + dimensions.width / 2,
      y: offset.y - dimensions.height * slot - 5 * (slot + 1) - 10,
    };

    const textOffset = {
      x: stunnedOffset.x - 5,
      y: stunnedOffset.y - 5,
    };

    const numberText =
      numberToRender > 1 ? (
        <Group width={20} height={20} offset={textOffset}>
          <Rect width={20} height={20} fill="white"></Rect>
          <Text
            width={20}
            height={20}
            text={`${numberToRender}`}
            fill="black"
            background="white"
            align="center"
            verticalAlign="middle"
            fontSize={20}
          ></Text>
        </Group>
      ) : null;

    return shouldRender ? (
      <Group
        width={dimensions.width}
        height={dimensions.height}
        key={`${this.props.id}-status${slot}-group`}
      >
        <Rect
          key={`${this.props.id}-status${slot}`}
          native={true}
          cornerRadius={8}
          width={dimensions.width}
          height={dimensions.height}
          fillPatternScaleX={0.5}
          fillPatternScaleY={0.5}
          offset={stunnedOffset}
          fillPatternImage={img}
        />
        {numberText}
      </Group>
    ) : null;
  }

  private get plainCardBack() {
    return (
      this.props.imgUrls.some((i) => i.includes("standard")) &&
      this.props.imgUrls.some((i) => i.includes("_back"))
    );
  }

  private get currentRotation() {
    return this.props.exhausted ? 90 : 0;
  }

  private getScale(
    img: HTMLImageElement | undefined,
    widthToUse: number,
    heightToUse: number
  ) {
    const width = !!img ? widthToUse / img.naturalWidth : widthToUse;

    const widthHorizontal = !!img ? heightToUse / img.naturalWidth : widthToUse;

    const height = !!img ? heightToUse / img.naturalHeight : heightToUse;

    const heightHorizontal = !!img
      ? widthToUse / img.naturalHeight
      : heightToUse;

    return shouldRenderImageHorizontal(
      this.props.code,
      this.props.typeCode || "",
      HORIZONTAL_TYPE_CODES,
      this.plainCardBack
    )
      ? { width: widthHorizontal, height: heightHorizontal }
      : { width, height };
  }

  private handleContextMenu = (event: KonvaEventObject<PointerEvent>): void => {
    if (!!this.props.handleContextMenu) {
      this.props.handleContextMenu(this.props.id, event);
    }
  };

  private handleDoubleClick = (event: KonvaEventObject<MouseEvent>) => {
    if (this.props.handleDoubleClick) {
      this.setState({ showDragHandle: false });
      this.props.handleDoubleClick(this.props.id, event);
    }
  };

  private handleDoubleTap = (event: KonvaEventObject<TouchEvent>) => {
    if (this.props.handleDoubleTap) {
      this.setState({ showDragHandle: false });
      this.props.handleDoubleTap(this.props.id, event);
    }
  };

  private handleDragStart = (event: KonvaEventObject<DragEvent>) => {
    if (this.props.handleDragStart) {
      this.props.handleDragStart(this.props.id, event);
    }
  };

  private handleDragMove = debounce((event: any) => {
    if (this.props.handleDragMove) {
      this.props.handleDragMove({
        id: this.props.id,
        dx: event.target.x() - this.props.x,
        dy: event.target.y() - this.props.y,
      });
    }
  }, 5);

  private handleDragEnd = (event: KonvaEventObject<DragEvent>) => {
    if (this.props.handleDragEnd && this.props.dragging) {
      // First make sure the cursor is back to normal
      window.document.body.style.cursor = "grab";

      // Next, cancel any outstanding move things that haven't debounced
      this.handleDragMove.cancel();

      this.props.handleDragEnd(this.props.id, event);
    }
  };

  private handleTap = (event: KonvaEventObject<TouchEvent>) => {
    this.handleTapOrClick(event, true);
  };

  private handleClick = (event: KonvaEventObject<MouseEvent>) => {
    this.handleTapOrClick(event, false);
  };

  private handleTapOrClick = (
    event: KonvaEventObject<MouseEvent> | KonvaEventObject<TouchEvent>,
    wasTouch: boolean
  ) => {
    if (this.props.handleClick) {
      this.props.handleClick(this.props.id, event, wasTouch);
      event.cancelBubble = true;
    }
  };

  private handleMouseDown = (event: any) => {
    event.cancelBubble = true;
    if (
      this.props.handleMouseDownWhenNotDraggable &&
      !!this.props.disableDragging
    ) {
      this.props.handleMouseDownWhenNotDraggable(this.props.id);
    }
  };

  private handleMouseUp = (event: any) => {
    if (
      this.props.handleMouseUpWhenNotDraggable &&
      !!this.props.disableDragging
    ) {
      this.props.handleMouseUpWhenNotDraggable(this.props.id);
    }
  };

  private handleTouchStart = (event: KonvaEventObject<TouchEvent>) => {
    event.cancelBubble = true;
    if (!!this.touchTimer) {
      clearTimeout(this.touchTimer);
      this.touchTimer = null;
    }

    this.touchTimer = setTimeout(() => {
      this.handleContextMenu(
        event as unknown as KonvaEventObject<PointerEvent>
      );
    }, 750);
  };

  private handleTouchMove = (event: KonvaEventObject<TouchEvent>) => {
    if (!!this.touchTimer) {
      clearTimeout(this.touchTimer);
      this.touchTimer = null;
    }
  };

  private handleTouchEnd = (event: KonvaEventObject<TouchEvent>) => {
    if (!!this.touchTimer) {
      clearTimeout(this.touchTimer);
      this.touchTimer = null;
    }
    if (!!this.props.handleMouseUpWhenNotDraggable) {
      this.props.handleMouseUpWhenNotDraggable(this.props.id);
    }
  };

  private handleMouseOver = () => {
    window.document.body.style.cursor = "grab";
    if (this.props.handleHover) {
      this.props.handleHover(this.props.id);
    }
  };

  private handleMouseOut = () => {
    window.document.body.style.cursor = "default";
    if (this.props.handleHoverLeave) {
      this.props.handleHoverLeave(this.props.id);
    }
  };
}

export default Card;
