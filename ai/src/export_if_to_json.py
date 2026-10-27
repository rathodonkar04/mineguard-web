import json
import joblib
import numpy as np

def export_trees():
    model = joblib.load("ai/models/isolation_forest.joblib")
    with open("ai/models/model_metadata.json", "r", encoding="utf-8") as f:
        meta = json.load(f)

    estimators_data = []
    for est in model.estimators_:
        tree = est.tree_
        estimators_data.append({
            "children_left": tree.children_left.tolist(),
            "children_right": tree.children_right.tolist(),
            "feature": tree.feature.tolist(),
            "threshold": [round(float(t), 8) for t in tree.threshold],
            "n_node_samples": tree.n_node_samples.tolist()
        })

    payload = {
        "n_estimators": len(estimators_data),
        "max_samples": int(model.max_samples_),
        "offset": float(model.offset_),
        "scale_factor": float(meta["score_normalization"]["scale_factor"]),
        "features_list": meta["feature_engineering"]["features_list"],
        "trees": estimators_data
    }

    with open("ai/models/isolation_forest_trees.json", "w", encoding="utf-8") as f:
        json.dump(payload, f)

    print(f"Exported {len(estimators_data)} Isolation Forest trees to ai/models/isolation_forest_trees.json")

if __name__ == "__main__":
    export_trees()
