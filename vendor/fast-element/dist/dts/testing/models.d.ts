declare class ChildModel {
    value: string;
}
declare class Model {
    childChangedCalled: boolean;
    trigger: number;
    value: number;
    child: ChildModel;
    child2: ChildModel;
    childChanged(): void;
    incrementTrigger(): void;
    decrementTrigger(): void;
    get ifConditional(): number;
}
declare class DerivedModel extends Model {
    child2ChangedCalled: boolean;
    child2Changed(): void;
    derivedChild: ChildModel;
}
export { ChildModel, DerivedModel, Model };
